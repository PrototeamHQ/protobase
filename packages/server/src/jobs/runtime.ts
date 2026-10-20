import { sql } from 'kysely'
import { PgBoss, type Db as BossDb } from 'pg-boss'
import type { Db } from '@protobase/query'
import { runInBackground } from '../background-work'
import { platformMailer } from '../mail/platform-mailer'
import type { Mailer } from '../mail/smtp-mailer'
import { busyDatabase } from './busy-database'
import { clearCurrentJobs, setCurrentJobs, type JobsEnqueuer } from './current'
import { jobsDatabase } from './database'
import type { EnqueueOptions, JobDefinition } from './job-types'
import { queueOptions, queueSettingsDiffer, sendOptions, workOptions } from './options'
import { runJob, validatePayload } from './run-job'
import { scheduleKey } from './schedule'
import { createSchedules } from './schedules'
import { jobsSchema } from './schema'

export type StartJobsOptions = {
  db: Db
  jobs: JobDefinition[]
  /** Runs the jobs in this process; `false` only enqueues them, for a process whose jobs another one runs. Default true. */
  work?: boolean
  /** Seconds between a worker's checks for due jobs; an enqueue outside a transaction wakes this process's worker at once. Default 2. */
  pollSeconds?: number
  /** Seconds running jobs get to finish when the jobs stop, before they are failed and retried later. Default 30. */
  shutdownSeconds?: number
  /** Gets every error the workers and the queue maintenance meet outside a job's own `run`. */
  onError: (error: unknown) => void
  /** The time recurring jobs are scheduled from; tests pass their own. */
  now?: () => Date
  /**
   * What jobs send mail with (`context.mail`): by default the platform's SMTP server from `PROTOBASE_SMTP_URL` and
   * `PROTOBASE_MAIL_FROM`, when set; `false` turns mail off whatever the environment says.
   */
  mailer?: Mailer | false
}

/** What a drain left: whether no job is due or running any more, how many are, and when the next one is due. */
export type DrainResult = { drained: boolean; remaining: number; nextDue: Date | null }

export type JobsRuntime = JobsEnqueuer & {
  /** Whether this process runs the jobs, or only enqueues them. */
  readonly works: boolean
  /** Takes the project's jobs again, as `protobase dev` does when their files change. */
  update(jobs: JobDefinition[]): Promise<void>
  /**
   * Runs the jobs that are due until none is due or running, or `seconds` have passed: for a host that wakes a sleeping
   * app to run its jobs. Needs this process to run jobs.
   */
  drain(seconds: number): Promise<DrainResult>
  /** When the next job is due, or `null` when none waits (`jobs.next_due()`). */
  nextDue(): Promise<Date | null>
  /** Stops taking jobs, lets running ones finish within `shutdownSeconds`, then fails and releases the rest. */
  stop(): Promise<void>
}

// pg-boss with what a Protobase host needs off: it never creates or migrates its schema (the project's migrations do),
// keeps no instance registry, runs no scheduler (Protobase's own recurring jobs do), rebuilds no index and takes no
// session state, so it works through a pooler in transaction mode. LISTEN/NOTIFY stays off for the same reason.
const createBoss = (db: BossDb, work: boolean) =>
  new PgBoss({
    db,
    schema: jobsSchema,
    migrate: false,
    createSchema: false,
    schedule: false,
    supervise: work,
    registerInstance: false,
    reindex: false,
    monitorVacuum: false,
    useListenNotify: false,
  })

/**
 * Starts the app's jobs in this process: their queues, a worker per job unless `work` is false, and the maintenance
 * that retries jobs whose worker died. It reads the jobs schema, never changes it: check it first with
 * `checkJobsSchema`. Enqueueing through `defineJob(...).enqueue` reaches the runtime started here.
 */
export const startJobs = async ({ db, jobs, work = true, pollSeconds = 2, shutdownSeconds = 30, onError, now = () => new Date(), mailer }: StartJobsOptions): Promise<JobsRuntime> => {
  const mail = mailer === undefined ? platformMailer() : mailer || undefined
  const database = busyDatabase(jobsDatabase(db))
  const boss = createBoss(database.db, work)
  boss.on('error', onError)
  await boss.start()
  const schedules = createSchedules(boss, db, now)

  const definitions = new Map<string, JobDefinition>()
  const workers = new Map<string, { id: string; concurrency: number }>()

  const ensureQueue = async (definition: JobDefinition) => {
    const wanted = queueOptions(definition.options)
    const queue = await boss.getQueue(definition.name)
    if (!queue) return boss.createQueue(definition.name, wanted)
    if (queue.policy !== wanted.policy) {
      throw new Error(
        `Job "${definition.name}" ${definition.options.ordered ? 'became' : 'is no longer'} ordered, but its queue keeps the old order. Let its jobs finish or delete them, drop the queue with \`select ${jobsSchema}.delete_queue('${definition.name}')\`, then start again.`,
      )
    }
    if (queueSettingsDiffer(wanted, queue)) {
      const { policy, ...settings } = wanted
      await boss.updateQueue(definition.name, settings)
    }
  }

  const startWorker = async (definition: JobDefinition) => {
    const concurrency = definition.options.concurrency ?? 1
    const running = workers.get(definition.name)
    if (running?.concurrency === concurrency) return
    if (running) await boss.offWork(definition.name)
    const id = await boss.work(
      definition.name,
      workOptions(concurrency, pollSeconds),
      // The definition as it is now, so a dev server's reloaded `run` takes the next job.
      // As background work, so jobs that hold the database for long leave a connection to page requests.
      async ([job]) => runInBackground(async () => {
        const current = definitions.get(definition.name) ?? definition
        if (current.options.schedule !== undefined && job!.singletonKey === scheduleKey) await schedules.following(current, job!.startAfter)
        return [await runJob(current, job!, db, mail)]
      }),
    )
    workers.set(definition.name, { id, concurrency })
  }

  const update = async (next: JobDefinition[]) => {
    for (const definition of next) await ensureQueue(definition)
    for (const name of definitions.keys()) {
      if (next.some((definition) => definition.name === name)) continue
      definitions.delete(name)
      if (workers.delete(name)) await boss.offWork(name)
    }
    for (const definition of next) definitions.set(definition.name, definition)
    if (!work) return
    for (const definition of next) await startWorker(definition)
    await schedules.sync(next)
  }

  const enqueue = async (definition: JobDefinition, target: Db, payload: unknown, options: EnqueueOptions = {}) => {
    const { name } = definition
    if (!definitions.has(name)) throw new Error(`Job "${name}" is not among the app's jobs; export it from the module protobase.config.ts passes as \`jobs\``)
    const checked = await validatePayload(definition, payload)
    if ('invalid' in checked) throw new Error(checked.invalid)
    const data = checked.value ?? null
    // pg-boss runs a group's jobs by their transaction's start, then by id: an ordered job takes its id from the
    // database's uuidv7(), which rises within a session, so the jobs one transaction enqueues run in that order, those
    // of jobs.enqueue() among them.
    const orderedId = definition.options.ordered ? (await sql<{ id: string }>`select uuidv7() as id`.execute(target)).rows[0]!.id : undefined
    const send = { ...sendOptions(definition.options, options), ...(orderedId !== undefined && { id: orderedId }), db: jobsDatabase(target) }
    // With a key: the waiting job, kept (dedupe) or given this payload (replace), or a new one. pg-boss's upsert
    // indexes waiting keys, so two enqueues racing for one key end with one job.
    const keyed = async (key: string) => {
      if (options.mode !== 'replace') {
        const [waiting] = await boss.findJobs(name, { key, queued: true, db: send.db })
        if (waiting) return waiting.id
      }
      return (await boss.upsert(name, data as object, send)).jobs[0]
    }
    const id = options.key === undefined ? await boss.send(name, data as object, send) : await keyed(options.key)
    if (!id) throw new Error(`Job "${name}" was not enqueued`)
    // A job enqueued in a transaction is not visible before it commits; the worker's next poll finds it.
    if (!target.isTransaction) wake(name)
    return id
  }

  const nextDue = async () => (await sql<{ due: Date | null }>`select ${sql.id(jobsSchema, 'next_due')}() as due`.execute(db)).rows[0]!.due

  // Jobs of this app that are due or running now: waiting past their start time, unless a failed job holds back their
  // ordered group, or running within their timeout.
  const pending = async () => {
    const job = sql.id(jobsSchema, 'job')
    const { rows } = await sql<{ count: number }>`
      select count(*)::int as count from ${job} j where j.name = any(${[...definitions.keys()]}::text[]) and (
        (j.state < 'active' and not j.blocked and j.start_after <= now()
          and not (j.policy = 'key_strict_fifo' and exists (
            select 1 from ${job} h where h.name = j.name and h.singleton_key = j.singleton_key and h.state = 'failed')))
        or (j.state = 'active' and j.started_on + j.expire_seconds * interval '1s' > now()))`.execute(db)
    return rows[0]!.count
  }

  // Whether this process's workers are between jobs: none holds a job, and pg-boss runs no statement, such as a woken
  // worker's fetch or a job's completion.
  const settled = () => database.idle() && boss.getWipData().every((worker) => worker.count === 0)

  const drain = async (seconds: number) => {
    if (!work) throw new Error('This process runs no jobs, so it cannot drain them')
    const deadline = Date.now() + seconds * 1000
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
    for (;;) {
      // A worker fetches when woken, rather than at its next poll.
      for (const worker of workers.values()) boss.notifyWorker(worker.id)
      const remaining = await pending()
      if (remaining === 0 || Date.now() >= deadline) return { drained: remaining === 0, remaining, nextDue: await nextDue() }
      // Counts again once the woken workers ran what they fetched, so the counts follow the jobs rather than how fast
      // they ran, and no sooner than 100 ms, for jobs another process runs.
      await sleep(100)
      while (!settled() && Date.now() < deadline) await sleep(10)
    }
  }

  const wake = (name: string) => {
    const worker = workers.get(name)
    if (worker) boss.notifyWorker(worker.id)
  }

  const runtime: JobsRuntime = {
    works: work,
    enqueue,
    wake,
    update,
    drain,
    nextDue,
    stop: async () => {
      await boss.stop({ graceful: true, timeout: shutdownSeconds * 1000 })
      clearCurrentJobs(runtime)
    },
  }
  try {
    await update(jobs)
    setCurrentJobs(runtime)
  } catch (error) {
    await boss.stop({ graceful: false })
    throw error
  }
  return runtime
}
