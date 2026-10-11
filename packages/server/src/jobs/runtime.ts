import { PgBoss } from 'pg-boss'
import type { Db } from '@protobase/query'
import { clearCurrentJobs, setCurrentJobs, type JobsEnqueuer } from './current'
import { jobsDatabase } from './database'
import type { EnqueueOptions, JobDefinition } from './job-types'
import { queueOptions, queueSettingsDiffer, sendOptions } from './options'
import { runJob, validatePayload } from './run-job'
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
}

export type JobsRuntime = JobsEnqueuer & {
  /** Takes the project's jobs again, as `protobase dev` does when their files change. */
  update(jobs: JobDefinition[]): Promise<void>
  /** Stops taking jobs, lets running ones finish within `shutdownSeconds`, then fails and releases the rest. */
  stop(): Promise<void>
}

// pg-boss with what a Protobase host needs off: it never creates or migrates its schema (the project's migrations do),
// keeps no instance registry, runs no scheduler (Protobase's own recurring jobs do), rebuilds no index and takes no
// session state, so it works through a pooler in transaction mode. LISTEN/NOTIFY stays off for the same reason.
const createBoss = (db: Db, work: boolean) =>
  new PgBoss({
    db: jobsDatabase(db),
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
export const startJobs = async ({ db, jobs, work = true, pollSeconds = 2, shutdownSeconds = 30, onError }: StartJobsOptions): Promise<JobsRuntime> => {
  const boss = createBoss(db, work)
  boss.on('error', onError)
  await boss.start()

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
      { batchSize: 1, localConcurrency: concurrency, pollingIntervalSeconds: pollSeconds, includeMetadata: true, perJobResults: true },
      // The definition as it is now, so a dev server's reloaded `run` takes the next job.
      async ([job]) => [await runJob(definitions.get(definition.name) ?? definition, job!, db)],
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
    if (work) for (const definition of next) await startWorker(definition)
  }

  const enqueue = async (definition: JobDefinition, target: Db, payload: unknown, options: EnqueueOptions = {}) => {
    const { name } = definition
    if (!definitions.has(name)) throw new Error(`Job "${name}" is not among the app's jobs; export it from the module protobase.config.ts passes as \`jobs\``)
    const checked = await validatePayload(definition, payload)
    if ('invalid' in checked) throw new Error(checked.invalid)
    const data = checked.value ?? null
    const send = { ...sendOptions(definition.options, options), db: jobsDatabase(target) }
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
    if (!target.isTransaction) {
      const worker = workers.get(name)
      if (worker) boss.notifyWorker(worker.id)
    }
    return id
  }

  const runtime: JobsRuntime = {
    enqueue,
    update,
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
