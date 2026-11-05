import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { Checkpoint, Definition, LoadedRun, RunStore, StepStatus } from '@protobase/workflows'
import type { CheckpointValues } from './checkpoint-values'

const json = (value: unknown) => (value === undefined ? null : JSON.stringify(value))

type Row = Omit<Checkpoint, 'value' | 'variables' | 'after'> & { value: unknown; variables: Record<string, unknown> | null; blob: string | null; status: StepStatus }

/**
 * The runner's store over the `workflows` schema: runs with their pinned version, and the latest checkpoint of each of
 * a run's scopes, with a large one's values kept as a file of the run (`values`) and only its path in the row.
 */
export const postgresRunStore = (schema: string, values: CheckpointValues): RunStore<Db> => {
  const runs = sql.id(schema, 'runs')
  const versions = sql.id(schema, 'versions')
  const checkpoints = sql.id(schema, 'checkpoints')
  return {
    load: async (db, id) => {
      const { rows } = await sql<LoadedRun & { definition: Definition }>`select r.id, v.definition, r.input, r.status, r.created_at as "startedAt", r.trace
        from ${runs} r join ${versions} v on v.workflow_id = r.workflow_id and v.version = r.version where r.id = ${id}`.execute(db)
      return rows[0]
    },
    checkpoints: async (db, id) => {
      const { rows } = await sql<Row>`select scope, seq, state, type, status, fetched_at as "fetchedAt", next, value, variables, attempt, failures,
          resume_at as "resumeAt", clock, error, cause, blob
        from ${checkpoints} where run_id = ${id}`.execute(db)
      return Promise.all(rows.map(async ({ blob, value, variables, ...row }) => ({ ...row, ...(blob ? await values.read(blob) : { value, variables: variables ?? {} }), after: row.seq })))
    },
    // One statement: each checkpoint replaces its scope's, unless that one is not the one it follows, which the row's
    // lock on conflict keeps true against a save of another segment at the same time.
    save: async (db, id, saved) => {
      const row = async (checkpoint: Checkpoint) => {
        const kept = await values.keep(id, { value: checkpoint.value, variables: checkpoint.variables })
        return sql`(${checkpoint.scope}, ${checkpoint.seq}::integer, ${checkpoint.after}::integer, ${checkpoint.state}, ${checkpoint.type}, ${checkpoint.status},
          ${checkpoint.fetchedAt}::timestamptz, ${checkpoint.next}, ${'blob' in kept ? null : json(kept.value)}::jsonb, ${'blob' in kept ? null : json(kept.variables)}::jsonb,
          ${'blob' in kept ? kept.blob : null}, ${checkpoint.attempt}::integer, ${JSON.stringify(checkpoint.failures)}::jsonb, ${checkpoint.resumeAt ?? null}::timestamptz,
          ${checkpoint.clock}::timestamptz, ${checkpoint.error ?? null}, ${checkpoint.cause ?? null})`
      }
      const { rows } = await sql<{ scope: string }>`insert into ${checkpoints} as c
        (run_id, scope, seq, follows, state, type, status, fetched_at, next, value, variables, blob, attempt, failures, resume_at, clock, error, cause)
        select ${id}::uuid, s.* from (values ${sql.join(await Promise.all(saved.map(row)))})
          as s (scope, seq, follows, state, type, status, fetched_at, next, value, variables, blob, attempt, failures, resume_at, clock, error, cause)
        on conflict (run_id, scope) do update set seq = excluded.seq, follows = excluded.follows, state = excluded.state, type = excluded.type,
          status = excluded.status, fetched_at = excluded.fetched_at, next = excluded.next, value = excluded.value, variables = excluded.variables,
          blob = excluded.blob, attempt = excluded.attempt, failures = excluded.failures, resume_at = excluded.resume_at, clock = excluded.clock,
          error = excluded.error, cause = excluded.cause
        where c.seq = excluded.follows
        returning scope`.execute(db)
      return rows.length === saved.length
    },
    // A run that ends drops its checkpoints in the same statement: its outcome is the run's own.
    update: async (db, id, change) => {
      const ended = change.status === 'succeeded' || change.status === 'failed'
      await sql`with changed as (update ${runs} set status = ${change.status},
          resume_at = ${change.status === 'waiting' ? change.resumeAt : null},
          output = ${change.status === 'succeeded' ? json(change.output) : null}::jsonb,
          error = ${change.status === 'failed' ? change.error : null}, cause = ${change.status === 'failed' ? change.cause : null},
          finished_at = ${ended ? sql`now()` : sql`null`}
        where id = ${id} and status not in ('succeeded', 'failed') returning id)
        delete from ${checkpoints} where ${ended}::boolean and run_id in (select id from changed)`.execute(db)
    },
  }
}
