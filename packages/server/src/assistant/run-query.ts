import { sql } from 'kysely'
import type { Db } from '@protobase/query'

export type QueryOptions = {
  /** Postgres cancels the statement after this long. Default 5000. */
  timeoutMs?: number
  /** At most this many rows come back; `truncated` says there were more. Default 200. */
  rowLimit?: number
}

export type QueryResult = { columns: string[]; rows: unknown[][]; truncated: boolean }

// One statement, sent with a parameter (the row limit), which makes every Postgres driver use the extended protocol:
// Postgres then refuses a text with more than one command ("cannot insert multiple commands into a prepared
// statement"), so the statement cannot end the transaction around it and run more. The newlines keep a trailing `--`
// comment from swallowing the wrapper.
const wrapped = (statement: string, rowLimit: number) =>
  sql<Record<string, unknown>>`with result as (\n${sql.raw(statement.trim().replace(/;\s*$/, ''))}\n) select * from result limit ${rowLimit + 1}`

// Values as JSON carries them, for the model and the dock.
const cell = (value: unknown) => {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Uint8Array) return `\\x${Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
  return value
}

const resultOf = (rows: Record<string, unknown>[], rowLimit: number): QueryResult => ({
  columns: Object.keys(rows[0] ?? {}),
  rows: rows.slice(0, rowLimit).map((row) => Object.values(row).map(cell)),
  truncated: rows.length > rowLimit,
})

const run = (db: Db, statement: string, options: QueryOptions, begin: string, end: (succeeded: boolean) => string) =>
  db.connection().execute(async (connection) => {
    const rowLimit = options.rowLimit ?? 200
    await sql.raw(begin).execute(connection)
    let succeeded = false
    try {
      await sql`select set_config('statement_timeout', ${String(options.timeoutMs ?? 5000)}, true)`.execute(connection)
      const { rows } = await wrapped(statement, rowLimit).execute(connection)
      succeeded = true
      return resultOf(rows, rowLimit)
    } finally {
      await sql.raw(end(succeeded)).execute(connection)
    }
  })

/**
 * Runs one SELECT (or VALUES, or a WITH query) in a READ ONLY transaction that is always rolled back, so nothing it
 * does, settings included, outlives it. Postgres refuses any write in it, and the statement cannot leave it.
 */
export const runReadOnlyQuery = (db: Db, statement: string, options: QueryOptions = {}) => run(db, statement, options, 'begin transaction read only', () => 'rollback')

/**
 * Runs one INSERT, UPDATE or DELETE with a RETURNING clause (or a query) in a READ WRITE transaction, committed when it
 * succeeds. Only call it for a statement the user approved.
 */
export const runReadWriteQuery = (db: Db, statement: string, options: QueryOptions = {}) =>
  run(db, statement, options, 'begin transaction read write', (succeeded) => (succeeded ? 'commit' : 'rollback'))
