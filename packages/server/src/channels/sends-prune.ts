import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { inBatches, pruneBatchSize } from '../realtime/broadcast-prune'
import { writeTransaction } from '../transactions'
import { sendsSchema } from './sends-schema-sql'

// Rows another pruner holds are left to it.
const deleteOldSends = (db: Db, statementTimeoutMs: number, limit: number) =>
  writeTransaction(db, statementTimeoutMs, async (trx) => {
    const { numAffectedRows } = await sql`delete from ${sql.id(sendsSchema, 'sends')} where id in (
        select id from ${sql.id(sendsSchema, 'sends')} where sent_at < now() - interval '48 hours' limit ${limit} for update skip locked
      )`.execute(trx)
    return Number(numAffectedRows ?? 0n)
  })

/** Deletes the sends of `channels.sends` more than 48 hours old, which no reader took because no socket was open, in batches. */
export const pruneSends = (db: Db, statementTimeoutMs: number) => inBatches(pruneBatchSize, (limit) => deleteOldSends(db, statementTimeoutMs, limit))
