import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { customStepOf, jobAnswer, jobErrors, limits, secretRedactor, StepError, type AnswerRefusal, type CustomStepJobs, type JobCompletion, type StepLog, type TaskAnswer } from '@protobase/workflows'
import type { JobSealer } from './job-seal'
import { HttpProblem, notFound } from '../../problem'
import { defineJob } from '../../jobs/define-job'
import type { JobDefinition } from '../../jobs/job-types'
import type { RunnerSettings } from '../options'

/** The job that looks at a runner's job once its lease ran out. */
export const leaseJobName = 'workflows.custom-step-lease'

/**
 * Answers the waiting Task whose token has this hash, with the answer and the run's wake in one transaction, as an
 * outside executor's answer by its token is.
 */
export type AnswerByHash = (hash: string, answer: TaskAnswer) => Promise<{ run: string } | AnswerRefusal>

/** A runner as its token admits it. */
export type Runner = { id: string; tenant_id: string | null; labels: unknown }

const notHeld = () => new HttpProblem(409, 'job-not-held', 'Conflict', 'This runner does not hold this job: it ended, or went back to the queue and to another runner')

/**
 * Queues a custom step's try as a job of the run's tenant's version of that step, in `db`, replacing the job of the
 * same try a segment queued before it stopped, which its new token supersedes; the job takes the run's tenant, and
 * its arguments sealed. A run whose tenant has no such custom step, or only a deleted one, fails the step. `queued`
 * follows each queueing, for a matching pass.
 */
export const customStepQueue = (schema: string, sealer: JobSealer, queued: () => void): CustomStepJobs<Db> => ({
  queue: async (db, job) => {
    const { name, version } = customStepOf(job.step)!
    const jobs = sql.id(schema, 'custom_step_jobs')
    const { rows } = await sql`insert into ${jobs} (run_id, visit, state, step, version_id, input, arguments, token_hash, tenant_id)
      select r.id, ${job.visit}, ${job.state}, ${job.step}, v.id, ${JSON.stringify(job.input) ?? null}::jsonb, ${await sealer.seal(job.arguments)}, ${job.hash}, r.tenant_id
      from ${sql.id(schema, 'runs')} r join ${sql.id(schema, 'custom_step_versions')} v
        on coalesce(v.tenant_id, '') = coalesce(r.tenant_id, '') and v.name = ${name} and v.version = ${version} and v.custom_step_id is not null
      where r.id = ${job.run}
      on conflict (run_id, visit) do update set step = excluded.step, version_id = excluded.version_id, input = excluded.input, arguments = excluded.arguments,
        token_hash = excluded.token_hash, status = 'queued', runner_id = null, requeues = 0, lease_until = null, queued_at = now(), passed_over_at = null, claimed_at = null,
        sent_at = null, finished_at = null, output = null, error = null, cause = null, logs = '[]'::jsonb
      returning id`.execute(db)
    if (rows.length === 0) throw new StepError('States.Runtime', `${job.step} is not a custom step of this app`)
    queued()
  },
})

type HeldJob = { status: string; runner_id: string | null; sent_at: Date | null; token_hash: string }

/**
 * What a runner does with a job it holds: heartbeats, logs and its completion, each refused once it no longer holds
 * it. Each answers the job's Task by its token's hash (`answer`), so its timeout, heartbeat, retries and the once-only
 * answer are the waiting Task's. Logs and a failure's cause are blanked of the workflows' secrets.
 */
export const runnerJobs = ({ db, schema, settings, secrets, answer }: { db: () => Db; schema: string; settings: RunnerSettings; secrets: readonly string[]; answer: AnswerByHash }) => {
  const jobs = sql.id(schema, 'custom_step_jobs')
  const held = (job: HeldJob, runner: Runner) => job.runner_id === runner.id && job.status === 'running' && job.sent_at !== null
  const blank = secretRedactor(secrets).text
  const find = async (trx: Db, id: string, lock = false) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('No job with this id')
    const { rows } = await sql<HeldJob & { logs: StepLog[] }>`select status, runner_id, sent_at, token_hash, logs from ${jobs} where id = ${id} ${lock ? sql`for update` : sql``}`.execute(trx)
    if (!rows[0]) throw notFound('No job with this id')
    return rows[0]
  }
  return {
    /**
     * Extends the runner's lease of the job and heartbeats its Task: `{ stop: true }` once the runner no longer holds
     * it, or its Task's try ended, by its time, its heartbeat or its run.
     */
    heartbeat: async (runner: Runner, id: string) => {
      const job = await find(db(), id)
      if (!held(job, runner)) return { stop: true }
      await sql`update ${jobs} set lease_until = ${new Date(Date.now() + settings.leaseMs)} where id = ${id} and runner_id = ${runner.id} and status = 'running'`.execute(db())
      return { stop: 'error' in (await answer(job.token_hash, { kind: 'heartbeat' })) }
    },

    /** Adds lines to the job's logs, each blanked and cut to a step's line length, keeping a step's last lines. */
    log: (runner: Runner, id: string, lines: readonly string[]) =>
      db().transaction().execute(async (trx) => {
        const job = await find(trx, id, true)
        if (!held(job, runner)) throw notHeld()
        const at = new Date().toISOString()
        const added = lines.map((line) => ({ at, message: blank(line).slice(0, limits.logLineLength) }))
        const logs = [...job.logs, ...added].slice(-limits.logLines)
        await sql`update ${jobs} set logs = ${JSON.stringify(logs)}::jsonb where id = ${id}`.execute(trx)
        return {}
      }),

    /**
     * Ends the job with its output, checked against its version's output schema, or with its failure, and its Task
     * with it (see `jobAnswer`); an output too large for a step to keep fails it as `Custom.InvalidOutput` too. Refused
     * with the name the Task's answer gives once the Task ended.
     */
    complete: async (runner: Runner, id: string, completion: JobCompletion) => {
      const job = await find(db(), id)
      if (!held(job, runner)) throw notHeld()
      const { rows } = await sql<{ output: Record<string, unknown>; error_prefix: string; errors: Record<string, string> }>`select v.output, v.error_prefix, v.errors
        from ${jobs} j join ${sql.id(schema, 'custom_step_versions')} v on v.id = j.version_id where j.id = ${id}`.execute(db())
      const given = jobAnswer(rows[0]!, 'output' in completion ? completion : { error: completion.error, cause: blank(completion.cause ?? '') })
      let answered = await answer(job.token_hash, given)
      if ('error' in answered && answered.error === 'InvalidOutput') answered = await answer(job.token_hash, { kind: 'failure', error: jobErrors.invalidOutput, cause: answered.message })
      if ('error' in answered) throw new HttpProblem(409, 'task-timed-out', answered.error, answered.message)
      return {}
    },
  }
}

/**
 * The job that looks at a runner's job as its lease runs out: a job whose runner sent a heartbeat meanwhile is looked
 * at again as its new lease runs out; one whose runner sent none goes back to the queue once, for another runner, and
 * the second time fails its Task with `States.HeartbeatTimeout` by its token's hash. `requeued` follows a job's return
 * to the queue, for a matching pass.
 */
export const leaseJob = ({ schema, settings, answer, requeued }: { schema: string; settings: RunnerSettings; answer: AnswerByHash; requeued: () => void }) => {
  const jobs = sql.id(schema, 'custom_step_jobs')
  let job: JobDefinition<{ job: string }> | undefined
  job = defineJob<{ job: string }>({
    name: leaseJobName,
    run: async ({ job: id }, context) => {
      const { rows } = await sql<{ status: string; lease_until: Date | null; requeues: number; token_hash: string }>`select status, lease_until, requeues, token_hash from ${jobs} where id = ${id}`.execute(context.db)
      const found = rows[0]
      if (!found || found.status !== 'running' || !found.lease_until) return
      // Leases are set and read by the app's clock, never the database's.
      const now = new Date()
      if (found.lease_until > now) return void (await job!.enqueue(context.db, { job: id }, { key: id, mode: 'replace', runAt: found.lease_until }))
      if (found.requeues < 1) {
        const { rows: back } = await sql`update ${jobs} set status = 'queued', runner_id = null, requeues = requeues + 1, lease_until = null, claimed_at = null, sent_at = null, passed_over_at = null, queued_at = now()
          where id = ${id} and status = 'running' and lease_until <= ${now} returning 1`.execute(context.db)
        if (back.length > 0) requeued()
        // A heartbeat that came meanwhile renewed it: look again as its new lease runs out.
        else await job!.enqueue(context.db, { job: id }, { key: id, mode: 'replace', runAt: new Date(now.getTime() + settings.leaseMs) })
        return
      }
      const cause = `Its runner sent no heartbeat within ${settings.leaseMs / 1000} seconds, on its second runner too`
      const answered = await answer(found.token_hash, { kind: 'failure', error: 'States.HeartbeatTimeout', cause })
      // The try ended meanwhile, without the job: it ends as timed out.
      if ('error' in answered) await sql`update ${jobs} set status = 'timed_out', error = 'States.HeartbeatTimeout', cause = ${cause}, finished_at = now(), arguments = null, lease_until = null where id = ${id} and status = 'running'`.execute(context.db)
    },
    maxAttempts: 10,
    retryDelay: '2 seconds',
    timeout: '1 minute',
    concurrency: 5,
  })
  return job
}
