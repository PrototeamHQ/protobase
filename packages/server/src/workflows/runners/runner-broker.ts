import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { matchJobs, type RunnerState } from '@protobase/workflows'
import type { JobDefinition } from '../../jobs/job-types'
import type { RunnerSettings } from '../options'
import type { JobSealer } from './job-seal'
import type { AnswerByHash, Runner } from './runner-jobs'

/** What a claim is answered with: a job to run, or nothing once the claim was held as long as it may be. */
export type Order = { order: 'job'; job: { id: string; step: string; input: unknown; deadline: string; heartbeat_seconds: number; lease_seconds: number } } | { order: 'none' }

type Sent = { id: string; runner_id: string; step: string; arguments: string; token_hash: string; deadline: Date; heartbeat_seconds: number | null }

// How often a process holding claims open matches jobs again and answers the claims a pass placed a job with.
const passMs = 1000

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
 * its claim's answer; a job whose arguments no longer open, as after the app's secret was retired, fails its Task.
 */
export const runnerBroker = ({ db, schema, settings, lease, sealer, answer, report }: { db: () => Db; schema: string; settings: RunnerSettings; lease: () => JobDefinition<{ job: string }>; sealer: JobSealer; answer: AnswerByHash; report: (error: unknown) => void }) => {
  const runners = sql.id(schema, 'runners')
  const jobs = sql.id(schema, 'custom_step_jobs')
  const held = new Map<string, (order: Order) => void>()
  let ticking: ReturnType<typeof setInterval> | undefined
  // Passes and sends run one at a time, so a claim whose time runs out never misses a job sent to it meanwhile.
  let line: Promise<unknown> = Promise.resolve()
  const inLine = <T>(work: () => Promise<T>) => {
    const done = line.then(work)
    line = done.catch(() => {})
    return done
  }

  // A sent job's order, or undefined for one whose arguments no longer open, which fails its Task instead.
  const orderOf = async (job: Sent): Promise<Order | undefined> => {
    const opened = await sealer.open(job.arguments)
    if (!opened) {
      await answer(job.token_hash, { kind: 'failure', error: 'States.Runtime', cause: "The job's arguments no longer open with the app's secret, which changed since the job was queued" })
      return
    }
    const leaseSeconds = settings.leaseMs / 1000
    // Often enough that one late heartbeat loses neither the lease nor the Task's own heartbeat.
    const every = Math.min(leaseSeconds, job.heartbeat_seconds ?? leaseSeconds) / 3
    return { order: 'job', job: { id: job.id, step: job.step, input: opened.value, deadline: job.deadline.toISOString(), heartbeat_seconds: every, lease_seconds: leaseSeconds } }
  }

  // Marks the jobs placed with these runners and not sent yet as sent, with what their claims are answered with.
  const take = async (ids: readonly string[]) => {
    if (ids.length === 0) return []
    const { rows } = await sql<Sent>`update ${jobs} j set sent_at = now() from ${sql.id(schema, 'task_tokens')} t
      where j.runner_id = any(${ids}) and j.status = 'running' and j.sent_at is null and t.token_hash = j.token_hash
      returning j.id, j.runner_id, j.step, j.arguments, j.token_hash, t.deadline, t.heartbeat_seconds`.execute(db())
    return rows
  }

  const send = async () => {
    for (const job of await take([...held.keys()])) {
      const order = await orderOf(job)
      // A claim whose job failed so stays held, for the next
      if (!order) continue
      const reply = held.get(job.runner_id)
      held.delete(job.runner_id)
      reply?.(order)
    }
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
        held.set(runner.id, reply)
        if (signal.aborted) close()
        else signal.addEventListener('abort', close, { once: true })
        void round()
        tick()
      })
    },
  }
}
