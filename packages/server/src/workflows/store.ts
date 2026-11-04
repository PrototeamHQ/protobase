import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { Definition, RunStore, SavedStep, StepRecord } from '@protobase/workflows'

const json = (value: unknown) => (value === undefined ? null : JSON.stringify(value))

/** The runner's store over the `workflows` schema: runs with their pinned version, and their steps. */
export const postgresRunStore = (schema: string): RunStore<Db> => {
  const runs = sql.id(schema, 'runs')
  const versions = sql.id(schema, 'versions')
  const steps = sql.id(schema, 'steps')
  return {
    load: async (db, id) => {
      const { rows } = await sql<{ id: string; definition: Definition; input: unknown; status: 'queued' }>`select r.id, v.definition, r.input, r.status
        from ${runs} r join ${versions} v on v.workflow_id = r.workflow_id and v.version = r.version where r.id = ${id}`.execute(db)
      return rows[0]
    },
    steps: async (db, id) => {
      const { rows } = await sql<SavedStep>`select scope, seq, state, status, attempt, output, assigned, next, resume_at as "resumeAt", error, cause
        from ${steps} where run_id = ${id} order by scope, seq`.execute(db)
      return rows
    },
    // One statement, guarded by the step's scope and number: a second segment saving the same step saves nothing.
    save: async (db, id, step: StepRecord) => {
      const { rows } = await sql<{ id: string }>`insert into ${steps}
        (run_id, tenant_id, scope, seq, state, type, status, attempt, input, output, assigned, next, resume_at, error, cause, logs, started_at, finished_at)
        select r.id, r.tenant_id, ${step.scope}, ${step.seq}, ${step.state}, ${step.type}, ${step.status}, ${step.attempt}, ${json(step.input)}::jsonb,
          ${json(step.output)}::jsonb, ${json(step.assigned)}::jsonb, ${step.next}, ${step.resumeAt ?? null}, ${step.error ?? null}, ${step.cause ?? null},
          ${JSON.stringify(step.logs)}::jsonb, ${step.startedAt}, ${step.finishedAt}
        from ${runs} r where r.id = ${id}
        on conflict (run_id, scope, seq) do nothing returning id`.execute(db)
      return rows.length > 0
    },
    update: async (db, id, change) => {
      const ended = change.status === 'succeeded' || change.status === 'failed'
      await sql`update ${runs} set status = ${change.status},
          resume_at = ${change.status === 'waiting' ? change.resumeAt : null},
          output = ${change.status === 'succeeded' ? json(change.output) : null}::jsonb,
          error = ${change.status === 'failed' ? change.error : null}, cause = ${change.status === 'failed' ? change.cause : null},
          finished_at = ${ended ? sql`now()` : sql`null`}
        where id = ${id} and status not in ('succeeded', 'failed')`.execute(db)
    },
  }
}
