import { sql } from 'kysely'
import type { Db } from './db'
import { QueryError } from './errors'

const setTimeout = (db: Db, value: string) => sql`select set_config('statement_timeout', ${value}, true)`.execute(db)

/**
 * Runs `run` with Postgres cancelling statements after `timeoutMs`. On a plain connection it opens its own
 * transaction. Given a transaction (for example a read-only one) it sets the timeout locally inside it and
 * restores the previous value afterwards, so the caller's other statements are unaffected.
 */
export const withStatementTimeout = async <T>(db: Db, timeoutMs: number, run: (trx: Db) => Promise<T>) => {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new QueryError('invalid_option', 'statementTimeoutMs must be a positive integer')
  }
  if (!db.isTransaction) {
    return db.transaction().execute(async trx => {
      await setTimeout(trx, String(timeoutMs))
      return run(trx)
    })
  }
  const previous = await sql<{ value: string }>`select current_setting('statement_timeout') as value`.execute(db)
  const restore = () => setTimeout(db, previous.rows[0]!.value)
  await setTimeout(db, String(timeoutMs))
  let result: T
  try {
    result = await run(db)
  } catch (error) {
    await restore().catch((restoreError: { code?: string }) => {
      // A failed statement aborts the transaction (25P02): restoring is refused, and pointless since the setting is
      // transaction-local and goes with the rollback. Reporting that refusal would hide the error that caused it.
      if (restoreError.code !== '25P02') throw restoreError
    })
    throw error
  }
  await restore()
  return result
}
