import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { EventActor } from '@protobase/schema'
import { actorPrefix, emitMessage } from './changes/logical-message'

/**
 * Sets `settings` for the rest of the open transaction and, given an `actor`, emits its `protobase_actor` message, so
 * the change stream knows who wrote the rows that follow: one statement, one round trip.
 */
export const applySettings = async (trx: Db, settings: Record<string, string>, actor?: EventActor) => {
  const parts = Object.entries(settings).map(([name, value]) => sql`set_config(${name}, ${value}, true)`)
  if (actor) parts.push(emitMessage(actorPrefix, JSON.stringify(actor)))
  if (parts.length === 0) return
  await sql`select ${sql.join(parts)}`.execute(trx)
}

/**
 * One transaction whose statements Postgres cancels after `timeoutMs` (SET LOCAL statement_timeout), with `settings`
 * set for it as well and `actor`'s message emitted (see `applySettings`), all in one statement.
 */
export const writeTransaction = <T>(db: Db, timeoutMs: number, run: (trx: Db) => Promise<T>, settings: Record<string, string> = {}, actor?: EventActor) =>
  db.transaction().execute(async (trx) => {
    await applySettings(trx, { statement_timeout: String(timeoutMs), ...settings }, actor)
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
