import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { RequestAccess } from '../request-access'

/** The name of the lock that lets one `move`, `reorder` or write of a table's `field` run at a time (see `writeOrderLocks`). */
export const orderLockName = (access: RequestAccess, field: string) => `move:${access.full.table.schema ?? ''}.${access.full.table.name}.${field}`

/**
 * The order lock a create or update takes when its `body` sets the resource's hand-order field (`.position()`), such as
 * the undo of a move, so a `move` never decides from an order such a write is about to change.
 */
export const writeOrderLocks = (access: RequestAccess, body: unknown) => {
  const field = access.full.position?.field
  if (field === undefined || typeof body !== 'object' || body === null || !Object.hasOwn(body, field)) return []
  return [orderLockName(access, field)]
}

/**
 * Takes the order locks of `names` for the rest of the transaction, each once and in sorted order, before the batch
 * writes anything: two batches then never hold one lock or row each while waiting on the other's.
 */
export const lockOrders = async (trx: Db, names: string[]) => {
  for (const name of [...new Set(names)].sort()) {
    await sql`select pg_advisory_xact_lock(hashtextextended(${name}, 0))`.execute(trx)
  }
}
