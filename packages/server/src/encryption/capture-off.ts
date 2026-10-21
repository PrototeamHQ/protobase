import { sql } from 'kysely'
import type { Db } from '@protobase/query'

/**
 * Runs `work` in a transaction on one connection that change capture skips (`<changes>.capture` set to `off` for this
 * transaction only): rewriting stored values is no change of a record, for history, events or webhooks.
 */
export const captureOff = <T>(db: Db, changesSchema: string, work: (trx: Db) => Promise<T>) =>
  db.transaction().execute(async (trx) => {
    await sql`select set_config(${`${changesSchema}.capture`}, 'off', true)`.execute(trx)
    return work(trx)
  })
