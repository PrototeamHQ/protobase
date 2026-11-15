import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { StepLog, TaskTokenStore, WaitingTask } from '@protobase/workflows'

type Row = {
  run_id: string
  status: WaitingTask['status']
  started_at: Date
  handed_off_at: Date | null
  deadline: Date
  heartbeat_seconds: number | null
  heartbeat_at: Date | null
  input: unknown
  logs: StepLog[]
  output: unknown
  error: string | null
  cause: string | null
  answered_at: Date | null
}

const waitingTask = (row: Row): WaitingTask => ({
  status: row.status,
  startedAt: row.started_at,
  handedOffAt: row.handed_off_at,
  deadline: row.deadline,
  heartbeatSeconds: row.heartbeat_seconds,
  heartbeatAt: row.heartbeat_at,
  ...(row.input !== null && { input: row.input }),
  logs: row.logs,
  ...(row.output !== null && { output: row.output }),
  error: row.error,
  cause: row.cause,
  answeredAt: row.answered_at,
})

/**
 * Waiting Tasks' tokens in the `task_tokens` table, by run and try. A try that began but was never handed off begins
 * again with a new token's hash, so the token it never handed off answers nothing; once handed off, or settled, it keeps
 * the one it has. An answer or an end settles only a try still waiting, in one statement, so of an answer and a timeout
 * that come together exactly one counts.
 */
export const postgresTaskTokens = (schema: string): TaskTokenStore<Db> => {
  const tokens = sql.id(schema, 'task_tokens')
  const columns = sql`run_id, status, started_at, handed_off_at, deadline, heartbeat_seconds, heartbeat_at, input, logs, output, error, cause, answered_at`
  return {
    find: async (db, run, visit) => {
      const { rows } = await sql<Row>`select ${columns} from ${tokens} where run_id = ${run} and visit = ${visit}`.execute(db)
      return rows[0] && waitingTask(rows[0])
    },
    begin: async (db, { run, visit, state, hash, startedAt, deadline, heartbeatSeconds }) => {
      await sql`insert into ${tokens} (run_id, visit, state, token_hash, started_at, deadline, heartbeat_seconds)
        values (${run}, ${visit}, ${state}, ${hash}, ${startedAt}, ${deadline}, ${heartbeatSeconds})
        on conflict (run_id, visit) do update set token_hash = excluded.token_hash, started_at = excluded.started_at, deadline = excluded.deadline, heartbeat_seconds = excluded.heartbeat_seconds
        where ${tokens}.handed_off_at is null and ${tokens}.status = 'waiting'`.execute(db)
    },
    handedOff: async (db, run, visit, { at, input, logs }) => {
      await sql`update ${tokens} set handed_off_at = ${at}, input = ${JSON.stringify(input) ?? null}::jsonb, logs = ${JSON.stringify(logs)}::jsonb
        where run_id = ${run} and visit = ${visit}`.execute(db)
    },
    close: async (db, run, visit, { error, cause }) => {
      const { rows } = await sql`update ${tokens} set status = 'failed', error = ${error}, cause = ${cause}
        where run_id = ${run} and visit = ${visit} and status = 'waiting' returning 1`.execute(db)
      return rows.length > 0
    },
    byHash: async (db, hash) => {
      const { rows } = await sql<Row>`select ${columns} from ${tokens} where token_hash = ${hash}`.execute(db)
      return rows[0] && { ...waitingTask(rows[0]), run: rows[0].run_id }
    },
    answer: async (db, hash, answer, at) => {
      const change =
        answer.kind === 'heartbeat'
          ? sql`heartbeat_at = ${at}`
          : answer.kind === 'success'
            ? sql`status = 'succeeded', output = ${JSON.stringify(answer.output) ?? 'null'}::jsonb, answered_at = ${at}`
            : sql`status = 'failed', error = ${answer.error}, cause = ${answer.cause}, answered_at = ${at}`
      const { rows } = await sql`update ${tokens} set ${change} where token_hash = ${hash} and status = 'waiting' returning 1`.execute(db)
      return rows.length > 0
    },
  }
}
