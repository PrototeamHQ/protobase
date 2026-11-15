import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { fileProperties, matchJobs, type JobBuild, type RunnerOrder, type RunnerState } from '@protobase/workflows'
import type { JobDefinition } from '../../jobs/job-types'
import type { RunnerSettings } from '../options'
import type { JobSealer } from './job-seal'
import { jobFiles } from './runner-files'
import type { AnswerByHash, Runner } from './runner-jobs'

type Order = RunnerOrder

type Sent = { id: string; runner_id: string; step: string; arguments: string; token_hash: string; deadline: Date; heartbeat_seconds: number | null; container: JobBuild; input_schema: Record<string, unknown>; output_schema: Record<string, unknown> }

type Prepared = { runner_id: string; version_id: string; tenant_id: string | null; step: string; container: JobBuild }

// How long a build that reported no end keeps its runner from being sent `prepare` for its version again.
const buildMs = 3600 * 1000

// How often a process holding claims open matches jobs again and answers the claims a pass placed a job with.
const passMs = 1000

/** What a runner builds a version's image from: the Dockerfile, the files beside it and the command, of its manifest. */
export const buildOf = (container: JobBuild): JobBuild => ({ dockerfile: container.dockerfile, files: container.files ?? {}, ...(container.command && { command: container.command }) })

/**
 * Gives the runners holding a claim here (`ids`) that build images, and hold no job placed with them and not yet sent,
 * one wanted custom step version each that they lack: one a workflow's published version of their tenant uses, whose
 * image their claim does not list, and that they have no build of under way or failed. Each runner is sent `prepare`
 * once per version until it lists the image or its build failed: a build of it is kept as building from now, which the
 * runner's report of the start takes up, and its claim is held open no longer. Under the matching pass's lock, so no
 * pass places a job with a runner answered so.
 */
export const preparePass = (db: Db, schema: string, ids: readonly string[]) =>
  db.transaction().execute(async (trx) => {
    if (ids.length === 0) return []
    const runners = sql.id(schema, 'runners')
    await sql`select pg_advisory_xact_lock(hashtextextended(${`${schema}.runners:match`}, 0))`.execute(trx)
    const now = new Date()
    const { rows } = await sql<Prepared>`select distinct on (r.id) r.id as runner_id, v.id as version_id, r.tenant_id, 'custom:' || v.name || ':' || v.version as step, v.container
      from ${runners} r
      join ${sql.id(schema, 'custom_step_wanted')} w on coalesce(w.tenant_id, '') = coalesce(r.tenant_id, '')
      join ${sql.id(schema, 'custom_step_versions')} v on v.id = w.version_id and v.custom_step_id is not null
      where r.id = any(${ids}) and r.polling_until > ${now} and not r.revoked and r.state -> 'kinds' @> '["build"]'::jsonb
        and not exists (select 1 from jsonb_array_elements(r.state -> 'images') i where i ->> 'step' = 'custom:' || v.name || ':' || v.version)
        and not exists (select 1 from ${sql.id(schema, 'custom_step_builds')} b where b.runner_id = r.id and b.version_id = v.id
          and (b.status = 'failed' or (b.status = 'building' and b.started_at > ${new Date(now.getTime() - buildMs)})))
        and not exists (select 1 from ${sql.id(schema, 'custom_step_jobs')} j where j.runner_id = r.id and j.status = 'running' and j.sent_at is null)
      order by r.id, v.name, v.version`.execute(trx)
    for (const row of rows) {
      await sql`insert into ${sql.id(schema, 'custom_step_builds')} (runner_id, version_id, step, status, tenant_id) values (${row.runner_id}, ${row.version_id}, ${row.step}, 'building', ${row.tenant_id})`.execute(trx)
    }
    if (rows.length > 0) await sql`update ${runners} set polling_until = null where id = any(${rows.map((row) => row.runner_id)})`.execute(trx)
    return rows
  })

/**
 * One matching pass over every process's runners: under an advisory lock, so one pass runs at a time across them, it
 * reads the runners holding a claim open (their claim not past, not revoked, none given a job not yet sent), every
 * runner of their tenants that holds a claim open or runs a job, which a job may wait for, and their tenants' queued
 * jobs, skipping jobs another transaction holds, and places them as `matchJobs` says. A placed job is
 * running, held by its runner for a lease, with the lease job queued for its end, and its runner holds no claim open
 * until the job is sent; a job left for a better runner is marked so from now.
 */
export const matchPass = (db: Db, schema: string, settings: RunnerSettings, lease: JobDefinition<{ job: string }>) =>
  db.transaction().execute(async (trx) => {
    const runners = sql.id(schema, 'runners')
    const jobs = sql.id(schema, 'custom_step_jobs')
    await sql`select pg_advisory_xact_lock(hashtextextended(${`${schema}.runners:match`}, 0))`.execute(trx)
    const now = new Date()
    const { rows: polling } = await sql<{ id: string; tenant_id: string | null; labels: unknown; state: RunnerState; polled_at: Date }>`select r.id, r.tenant_id, r.labels, r.state, r.polled_at from ${runners} r
      where r.polling_until > ${now} and not r.revoked and r.token_hash is not null
        and not exists (select 1 from ${jobs} j where j.runner_id = r.id and j.status = 'running' and j.sent_at is null)`.execute(trx)
    if (polling.length === 0) return 0
    const tenants = [...new Set(polling.map((runner) => runner.tenant_id ?? ''))]
    const { rows: known } = await sql<{ tenant_id: string | null; state: RunnerState }>`select r.tenant_id, r.state from ${runners} r
      where coalesce(r.tenant_id, '') = any(${tenants}) and not r.revoked and r.state is not null
        and (r.polling_until > ${now} or exists (select 1 from ${jobs} j where j.runner_id = r.id and j.status = 'running'))`.execute(trx)
    const { rows: queued } = await sql<{ id: string; tenant_id: string | null; step: string; queued_at: Date; passed_over_at: Date | null }>`select id, tenant_id, step, queued_at, passed_over_at from ${jobs}
      where status = 'queued' and coalesce(tenant_id, '') = any(${tenants}) order by queued_at limit 1000 for update skip locked`.execute(trx)
    if (queued.length === 0) return 0
    const { placements, passedOver } = matchJobs({
      jobs: queued.map((job) => ({ id: job.id, tenant: job.tenant_id, step: job.step, queuedAt: job.queued_at, passedOverAt: job.passed_over_at })),
      runners: polling.map((runner) => ({ id: runner.id, tenant: runner.tenant_id, labels: Array.isArray(runner.labels) ? (runner.labels as string[]) : [], state: runner.state, polledAt: runner.polled_at })),
      known: known.map((runner) => ({ tenant: runner.tenant_id, state: runner.state })),
      now,
      settings,
    })
    const until = new Date(now.getTime() + settings.leaseMs)
    for (const placement of placements) {
      await sql`update ${jobs} set status = 'running', runner_id = ${placement.runner}, claimed_at = ${now}, lease_until = ${until} where id = ${placement.job} and status = 'queued'`.execute(trx)
      await lease.enqueue(trx, { job: placement.job }, { key: placement.job, mode: 'replace', runAt: until })
    }
    if (placements.length > 0) await sql`update ${runners} set polling_until = null where id = any(${placements.map((placement) => placement.runner)})`.execute(trx)
    if (passedOver.length > 0) await sql`update ${jobs} set passed_over_at = ${now} where id = any(${passedOver}) and passed_over_at is null`.execute(trx)
    return placements.length
  })

/**
 * The claims this process holds open, and the matching passes that answer them. A claim keeps what the runner says of
 * itself and holds until its time: a pass runs as it comes, as a job is queued or goes back to the queue (`nudge`), and
 * once a second while this process holds a claim, which is how a claim held here hears of a job a pass in another
 * process placed with its runner. Each placed job is sent once, to the claim of its runner, by marking it sent; a
 * claim whose time ran out takes a job placed meanwhile, and a runner's next claim takes one sent to a claim no longer
 * held. One process needs nothing more; several share only the database. A job's sealed arguments are opened only into
 * its claim's answer, with its input files' job-scoped addresses under `path` and how its image is built; a job whose
 * arguments no longer open, as after the app's secret was retired, fails its Task. A claim that no job reached after
 * a pass is answered `prepare` for a version it should build (`preparePass`). `stop`, as the process closes, answers
 * every claim held here with none, and each claim made after it at once.
 */
export const runnerBroker = ({ db, schema, path, settings, lease, sealer, answer, report }: { db: () => Db; schema: string; path: () => string; settings: RunnerSettings; lease: () => JobDefinition<{ job: string }>; sealer: JobSealer; answer: AnswerByHash; report: (error: unknown) => void }) => {
  const runners = sql.id(schema, 'runners')
  const jobs = sql.id(schema, 'custom_step_jobs')
  const held = new Map<string, (order: Order) => void>()
  // Until when each claim held here is held, so one whose job failed before it was sent can take the next.
  const untils = new WeakMap<(order: Order) => void, Date>()
  let ticking: ReturnType<typeof setInterval> | undefined
  let stopped = false
  // Passes and sends run one at a time, so a claim whose time runs out never misses a job sent to it meanwhile.
  let line: Promise<unknown> = Promise.resolve()
  const inLine = <T>(work: () => Promise<T>) => {
    const done = line.then(work)
    line = done.catch(() => {})
    return done
  }

  // A sent job's order, or undefined for one whose arguments no longer open, or whose file arguments are no files, which
  // fails its Task instead.
  const orderOf = async (job: Sent): Promise<Order | undefined> => {
    const opened = await sealer.open(job.arguments)
    if (!opened) {
      await answer(job.token_hash, { kind: 'failure', error: 'States.Runtime', cause: "The job's arguments no longer open with the app's secret, which changed since the job was queued" })
      return
    }
    const files = jobFiles(job.input_schema, opened.value, `${path()}/jobs/${job.id}/inputs`)
    if ('error' in files) {
      await answer(job.token_hash, { kind: 'failure', error: files.error, cause: files.cause })
      return
    }
    const leaseSeconds = settings.leaseMs / 1000
    // Often enough that one late heartbeat loses neither the lease nor the Task's own heartbeat.
    const every = Math.min(leaseSeconds, job.heartbeat_seconds ?? leaseSeconds) / 3
    const build = buildOf(job.container)
    return {
      order: 'job',
      job: { id: job.id, step: job.step, input: opened.value, deadline: job.deadline.toISOString(), heartbeat_seconds: every, lease_seconds: leaseSeconds, files: files.files, output_files: fileProperties(job.output_schema), build, ...(build.command && { command: build.command }) },
    }
  }

  // Marks the jobs placed with these runners and not sent yet as sent, with what their claims are answered with.
  const take = async (ids: readonly string[]) => {
    if (ids.length === 0) return []
    const { rows } = await sql<Sent>`update ${jobs} j set sent_at = now() from ${sql.id(schema, 'task_tokens')} t, ${sql.id(schema, 'custom_step_versions')} v
      where j.runner_id = any(${ids}) and j.status = 'running' and j.sent_at is null and t.token_hash = j.token_hash and v.id = j.version_id
      returning j.id, j.runner_id, j.step, j.arguments, j.token_hash, t.deadline, t.heartbeat_seconds, v.container, v.input as input_schema, v.output as output_schema`.execute(db())
    return rows
  }

  // Answers the claims held here that a job reached none of with `prepare`, for a wanted version they lack.
  const prepare = async () => {
    for (const row of await preparePass(db(), schema, [...held.keys()])) {
      const reply = held.get(row.runner_id)
      held.delete(row.runner_id)
      reply?.({ order: 'prepare', step: row.step, build: buildOf(row.container) })
    }
  }

  const send = async () => {
    let again = false
    for (const job of await take([...held.keys()])) {
      const order = await orderOf(job)
      const reply = held.get(job.runner_id)
      // A claim whose job failed so stays held, for the next: the pass that placed the job took it from the matching,
      // which it goes back to until its time, and a pass after this one may place another job with it at once.
      if (!order) {
        const until = reply && untils.get(reply)
        if (until && until > new Date()) {
          await sql`update ${runners} set polling_until = ${until} where id = ${job.runner_id} and polling_until is null`.execute(db())
          again = true
        }
        continue
      }
      held.delete(job.runner_id)
      reply?.(order)
    }
    if (again) void round()
  }

  let pending = false
  // One pass and its sends, unless one is waiting to run already, which will see what this one would.
  const round = () => {
    if (pending) return line
    pending = true
    return inLine(async () => {
      pending = false
      await matchPass(db(), schema, settings, lease())
      await send()
      await prepare()
    }).catch(report)
  }

  const tick = () => {
    if (ticking || held.size === 0) return
    ticking = setInterval(() => {
      if (held.size > 0) return void round()
      clearInterval(ticking)
      ticking = undefined
    }, passMs)
    // A held claim keeps no process alive on its own.
    ;(ticking as { unref?: () => void }).unref?.()
  }

  return {
    nudge: () => void round(),

    /**
     * Holds the runner's claim open until a pass places a job with it, its time runs out (`{ order: 'none' }`) or the
     * runner goes (`signal`); a second claim of the same runner answers the first with none. What the runner says of
     * itself is kept on its record.
     */
    claim: async (runner: Runner, state: RunnerState, signal: AbortSignal): Promise<Order> => {
      if (stopped) return { order: 'none' }
      const until = new Date(Date.now() + settings.claimMs)
      await sql`update ${runners} set state = ${JSON.stringify(state)}::jsonb, polled_at = now(), polling_until = ${until} where id = ${runner.id}`.execute(db())
      return new Promise<Order>((resolve) => {
        held.get(runner.id)?.({ order: 'none' })
        const reply = (order: Order) => {
          clearTimeout(timer)
          signal.removeEventListener('abort', close)
          resolve(order)
        }
        // Once its time ran out or the runner went: a job placed with it meanwhile, or none, and no claim held open.
        const close = () =>
          void inLine(async () => {
            if (held.get(runner.id) !== reply) return
            const [job] = await take([runner.id])
            const order = job && (await orderOf(job))
            held.delete(runner.id)
            if (!order) await sql`update ${runners} set polling_until = null where id = ${runner.id} and polling_until = ${until}`.execute(db())
            reply(order ?? { order: 'none' })
          }).catch((error: unknown) => {
            report(error)
            if (held.get(runner.id) === reply) held.delete(runner.id)
            reply({ order: 'none' })
          })
        const timer = setTimeout(close, settings.claimMs)
        untils.set(reply, until)
        held.set(runner.id, reply)
        // A claim made while the broker stopped ends as one whose runner went.
        if (signal.aborted || stopped) close()
        else signal.addEventListener('abort', close, { once: true })
        void round()
        tick()
      })
    },

    /**
     * Answers every claim held here with none, once a pass under way has sent what it placed, and holds no claim from
     * now on, so a closing process need not wait for their time; their runners hold no claim open until they claim
     * again, of another process.
     */
    stop: async () => {
      stopped = true
      clearInterval(ticking)
      ticking = undefined
      await inLine(async () => {
        const ids = [...held.keys()]
        for (const reply of held.values()) reply({ order: 'none' })
        held.clear()
        if (ids.length > 0) await sql`update ${runners} set polling_until = null where id = any(${ids})`.execute(db())
      }).catch(report)
    },
  }
}
