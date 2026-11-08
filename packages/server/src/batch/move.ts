import { sql } from 'kysely'
import { listQuery, maxLimit, type Db } from '@protobase/query'
import type { Deps } from '../deps'
import type { ScheduledDelete } from '../files/cleanup-schedule'
import { preconditionFailed } from '../problem'
import { readFilter } from '../related-filter'
import type { RequestAccess } from '../request-access'
import { missing, type WriteResult } from '../write-shared'
import { encodeKey, movePlan, type Ranked } from '@protobase/schema/internal'
import { checkOrderField, reorderIn } from './reorder'

type Key = (string | number)[]

export type MoveInput = { field: string; key: Key; after: Key | null; before?: Key | null | undefined }

/**
 * The list a move reads, as `filter` limits it for the caller, checked by the scan guard. It runs before the batch's
 * transaction opens, since the guard reads the table's indexes on a connection of its own.
 */
export const moveList = async (deps: Deps, access: RequestAccess, field: string, source: string | undefined) => {
  checkOrderField(access, field)
  const { entry, model, full } = access
  const { filter, scope } = await readFilter(access, model, full, source)
  await deps.guard(entry, { ...(filter && { filter }), sort: [[field, 'asc']] }, { model, scope })
  return { filter, scope }
}

export type MoveList = Awaited<ReturnType<typeof moveList>>

// The list as stored, every page of it, as a hand-sorted list loads it: its records' keys and order values.
const storedOrder = async (trx: Db, access: RequestAccess, field: string, { filter, scope }: MoveList) => {
  const { model, full } = access
  const sort: [string, 'asc'][] = [[field, 'asc']]
  const columns = [...new Set([...full.primaryKey, field])]
  const rows: (Ranked & { parts: Key })[] = []
  let cursor: string | null = null
  do {
    const page: Awaited<ReturnType<typeof listQuery>> = await listQuery(trx, model, { ...(filter && { filter }), sort, columns, limit: maxLimit, ...(cursor && { cursor }) }, scope)
    for (const row of page.rows) {
      const parts = full.primaryKey.map((name) => row[name] as string | number)
      rows.push({ key: encodeKey(parts), parts, rank: row[field] })
    }
    cursor = page.nextCursor
  } while (cursor)
  return rows
}

/**
 * `move`: the record `key` goes just after `after` (first when null) in `list` (from `moveList`), ordered by `field`, as
 * long as the record after `after` there is still `before` (null: none; undefined: not checked), and is refused with 412
 * otherwise. Any other change, to the list or to the records, does not refuse it: it is anchored to its place, not to
 * ETags. The stretch it renumbers comes from the stored order, written as a `reorder` is (see `reorderIn`).
 */
export const moveIn = async (trx: Db, deps: Deps, access: RequestAccess, input: MoveInput, list: MoveList, removed: ScheduledDelete[]): Promise<WriteResult[]> => {
  // One move of the resource's order at a time, so each reads the order the one before it left
  await sql`select pg_advisory_xact_lock(hashtextextended(${`move:${access.full.table.schema ?? ''}.${access.full.table.name}.${input.field}`}, 0))`.execute(trx)
  const rows = await storedOrder(trx, access, input.field, list)
  const plan = movePlan(rows, encodeKey(input.key), input.after && encodeKey(input.after), input.before === undefined ? undefined : input.before && encodeKey(input.before))
  if (!plan) throw missing(access.entry)
  if ('stale' in plan) throw preconditionFailed('The list changed where the record was dropped')
  const parts = new Map(rows.map((row) => [row.key, row.parts]))
  const etags = Object.fromEntries(plan.keys.map((name) => [name, '*']))
  return reorderIn(trx, deps, access, { field: input.field, keys: plan.keys.map((name) => parts.get(name)!), etags, start: plan.start }, removed)
}
