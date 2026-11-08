import { sql } from 'kysely'
import type { Db } from '@protobase/query'

/**
 * Runs `write` so that it keeps all of its changes or none: in a transaction of its own, or in a savepoint of `db`'s
 * when `db` is a transaction already. An error `write` throws rolls its changes back and is thrown on.
 */
export const allOrNothing = async (db: Db, write: (trx: Db) => Promise<void>) => {
  if (!db.isTransaction) return db.transaction().execute(write)
  await sql`savepoint all_or_nothing`.execute(db)
  try {
    await write(db)
  } catch (error) {
    await sql`rollback to savepoint all_or_nothing`.execute(db)
    throw error
  }
  await sql`release savepoint all_or_nothing`.execute(db)
}
