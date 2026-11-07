import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { Checkpoint, Definition, RunStore, TraceMode } from '@protobase/workflows'

const json = (value: unknown) => (value === undefined ? null : JSON.stringify(value))

/** The runner's store over the `workflows` schema: runs with their pinned version, and the latest checkpoint of each of a run's scopes. */
export const postgresRunStore = (schema: string): RunStore<Db> => {
  const runs = sql.id(schema, 'runs')
  const versions = sql.id(schema, 'versions')
  const checkpoints = sql.id(schema, 'checkpoints')
  return {
    load: async (db, id) => {
      const { rows } = await sql<{ id: string; definition: Definition; input: unknown; status: 'queued'; startedAt: Date; trace: TraceMode | null; replay: boolean | null; rerun_of: string | null }>`select r.id, v.definition, r.input, r.status, r.created_at as "startedAt", r.trace, r.replay, r.rerun_of
        from ${runs} r join ${versions} v on v.workflow_id = r.workflow_id and v.version = r.version where r.id = ${id}`.execute(db)
      if (!rows[0]) return
      // A replay stays one when the run it replays is gone (its key set to null): its writing steps then give nothing.
      const { replay, rerun_of, ...run } = rows[0]
      return { ...run, ...(replay === true && { replayOf: rerun_of }) }
    },
    checkpoints: async (db, id) => {
      const { rows } = await sql<Omit<Checkpoint, 'after'>>`select scope, seq, state, type, status, fetched_at as "fetchedAt", next, value, variables, attempt, failures,
          resume_at as "resumeAt", clock
        from ${checkpoints} where run_id = ${id}`.execute(db)
      return rows.map((row) => ({ ...row, after: row.seq }))
    },
    // One statement: each checkpoint replaces its scope's, unless that one is not the one it follows, which the row's
    // lock on conflict keeps true against a save of another segment at the same time.
    save: async (db, id, saved) => {
      const row = (checkpoint: Checkpoint) =>
        sql`(${checkpoint.scope}, ${checkpoint.seq}::integer, ${checkpoint.after}::integer, ${checkpoint.state}, ${checkpoint.type}, ${checkpoint.status},
          ${checkpoint.fetchedAt}::timestamptz, ${checkpoint.next}, ${json(checkpoint.value)}::jsonb, ${JSON.stringify(checkpoint.variables)}::jsonb,
          ${checkpoint.attempt}::integer, ${JSON.stringify(checkpoint.failures)}::jsonb, ${checkpoint.resumeAt ?? null}::timestamptz, ${checkpoint.clock}::timestamptz)`
      const { rows } = await sql<{ scope: string }>`insert into ${checkpoints} as c
        (run_id, scope, seq, follows, state, type, status, fetched_at, next, value, variables, attempt, failures, resume_at, clock)
        select ${id}::uuid, s.* from (values ${sql.join(saved.map(row))})
          as s (scope, seq, follows, state, type, status, fetched_at, next, value, variables, attempt, failures, resume_at, clock)
        on conflict (run_id, scope) do update set seq = excluded.seq, follows = excluded.follows, state = excluded.state, type = excluded.type,
          status = excluded.status, fetched_at = excluded.fetched_at, next = excluded.next, value = excluded.value, variables = excluded.variables,
          attempt = excluded.attempt, failures = excluded.failures, resume_at = excluded.resume_at, clock = excluded.clock
        where c.seq = excluded.follows
        returning scope`.execute(db)
      return rows.length === saved.length
    },
    // A run that succeeds drops its checkpoints in the same statement, its outcome being the run's own; one that fails
    // keeps them for a re-run to go on from.
    update: async (db, id, change) => {
      const ended = change.status === 'succeeded' || change.status === 'failed'
      await sql`with changed as (update ${runs} set status = ${change.status},
          resume_at = ${change.status === 'waiting' ? change.resumeAt : null},
          output = ${change.status === 'succeeded' ? json(change.output) : null}::jsonb,
          error = ${change.status === 'failed' ? change.error : null}, cause = ${change.status === 'failed' ? change.cause : null},
          finished_at = ${ended ? sql`now()` : sql`null`}
        where id = ${id} and status not in ('succeeded', 'failed') returning id)
        delete from ${checkpoints} where ${change.status === 'succeeded'}::boolean and run_id in (select id from changed)`.execute(db)
    },
  }
}
