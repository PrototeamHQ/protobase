import { sql } from 'kysely'
import type { Db } from '@protobase/query'

/** One transaction whose statements Postgres cancels after `timeoutMs` (SET LOCAL statement_timeout). */
export const writeTransaction = <T>(db: Db, timeoutMs: number, run: (trx: Db) => Promise<T>) =>
  db.transaction().execute(async (trx) => {
    await sql`select set_config('statement_timeout', ${String(timeoutMs)}, true)`.execute(trx)
    return run(trx)
  })

/** Same, and Postgres refuses any write inside it. */
export const readTransaction = <T>(db: Db, timeoutMs: number, run: (trx: Db) => Promise<T>) =>
  writeTransaction(db, timeoutMs, async (trx) => {
    await sql`set transaction read only`.execute(trx)
    return run(trx)
  })
