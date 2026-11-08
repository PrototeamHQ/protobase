import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { RequestAccess } from '../request-access'

/** The name of the lock that lets one `move` or `reorder` of a table's `field` run at a time. */
export const orderLockName = (access: RequestAccess, field: string) => `move:${access.full.table.schema ?? ''}.${access.full.table.name}.${field}`

/**
 * Takes the order locks of `names` for the rest of the transaction, each once and in sorted order, before the batch
 * writes anything: two batches then never hold one lock or row each while waiting on the other's.
 */
export const lockOrders = async (trx: Db, names: string[]) => {
  for (const name of [...new Set(names)].sort()) {
    await sql`select pg_advisory_xact_lock(hashtextextended(${name}, 0))`.execute(trx)
  }
}
