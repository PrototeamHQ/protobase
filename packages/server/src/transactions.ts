import { sql } from 'kysely'
import type { Db } from '@protobase/query'

/**
 * One transaction whose statements Postgres cancels after `timeoutMs` (SET LOCAL statement_timeout), with `settings`
 * set for it as well, all in one statement.
 */
export const writeTransaction = <T>(db: Db, timeoutMs: number, run: (trx: Db) => Promise<T>, settings: Record<string, string> = {}) =>
  db.transaction().execute(async (trx) => {
    const all = Object.entries({ statement_timeout: String(timeoutMs), ...settings })
    await sql`select ${sql.join(all.map(([name, value]) => sql`set_config(${name}, ${value}, true)`))}`.execute(trx)
    return run(trx)
  })

/** Same, and Postgres refuses any write inside it. */
export const readTransaction = <T>(db: Db, timeoutMs: number, run: (trx: Db) => Promise<T>, settings: Record<string, string> = {}) =>
  writeTransaction(db, timeoutMs, async (trx) => {
    await sql`set transaction read only`.execute(trx)
    return run(trx)
  }, settings)

/** A read-only transaction whose statements all read one snapshot (REPEATABLE READ), cancelled after `timeoutMs` each. */
export const snapshotReadTransaction = <T>(db: Db, timeoutMs: number, run: (trx: Db) => Promise<T>) =>
  db
    .transaction()
    .setIsolationLevel('repeatable read')
    .setAccessMode('read only')
    .execute(async (trx) => {
      await sql`select set_config('statement_timeout', ${String(timeoutMs)}, true)`.execute(trx)
      return run(trx)
    })
