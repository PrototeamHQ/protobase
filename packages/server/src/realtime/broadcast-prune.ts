import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { writeTransaction } from '../transactions'
import { messagesTableExists } from './database-broadcasts'

/** Broadcast rows deleted in one statement at most. */
export const pruneBatchSize = 1000

/** Runs `deleteBatch` until it deletes fewer rows than `batchSize`, so a backlog drains one short statement at a time. */
export const inBatches = async (batchSize: number, deleteBatch: (limit: number) => Promise<number>) => {
  for (;;) {
    if ((await deleteBatch(batchSize)) < batchSize) return
  }
}

// `inserted_at` is a timestamp without time zone, stamped in the sending session's zone, so a fresh row can look up to
// 26 hours old to a session in another zone: 48 hours stays clear of that. Rows another pruner holds are left to it.
const deleteOldBroadcasts = (db: Db, statementTimeoutMs: number, limit: number) =>
  writeTransaction(db, statementTimeoutMs, async (trx) => {
    const { numAffectedRows } = await sql`delete from realtime.messages where id in (
        select id from realtime.messages where extension = 'broadcast' and inserted_at < localtimestamp - interval '48 hours'
        limit ${limit} for update skip locked
      )`.execute(trx)
    return Number(numAffectedRows ?? 0n)
  })

/**
 * Deletes the broadcast rows of `realtime.messages` more than 48 hours old, which no reader took because no socket was
 * open, in batches of `batchSize`; a database without `realtime.messages` has none.
 */
export const pruneBroadcasts = async (db: Db, statementTimeoutMs: number, batchSize = pruneBatchSize) => {
  if (!(await messagesTableExists(db))) return
  await inBatches(batchSize, (limit) => deleteOldBroadcasts(db, statementTimeoutMs, limit))
}
