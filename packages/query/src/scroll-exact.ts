import { sql, type SqlBool } from 'kysely'
import type { CheckedFilter, ResourceModel } from '@protobase/schema'
import { baseQuery } from './base-query'
import { columnRef } from './columns'
import { orderTerm } from './order'
import type { Scope } from './scope'
import { encodeCursor } from './cursor'
import type { Db } from './db'
import { toNumber } from './numbers'
import type { SortKey } from './sort'

const rankedRows = (db: Db, model: ResourceModel, keys: SortKey[], scope?: Scope, filter?: CheckedFilter) => {
  const order = sql.join(keys.map(key => orderTerm(key)))
  return baseQuery(db, model, filter, scope)
    .select(keys.map((key, i) => sql`${columnRef(key.field)}::text`.as(`k${i}`)))
    .select(sql`row_number() over (order by ${order})`.as('rn'))
}

/** Every `step`-th row's leading sort value with its exact 0-based position. */
export const exactAnchors = async (db: Db, model: ResourceModel, keys: SortKey[], step: number, scope?: Scope, filter?: CheckedFilter) => {
  const rows = await db
    .selectFrom(rankedRows(db, model, keys, scope, filter).as('r'))
    .select([sql`r.k0`.as('value'), sql`r.rn::text`.as('rn')])
    .where(sql<SqlBool>`(r.rn - 1) % ${step} = 0`)
    .orderBy(sql`r.rn`)
    .execute()
  return rows.map(row => ({ position: toNumber(row.rn) - 1, value: String(row.value) }))
}

/** Cursor for the row just before `position`, so a page read after it starts exactly at `position`. */
export const exactSeek = async (db: Db, model: ResourceModel, keys: SortKey[], scope: Scope | undefined, filter: CheckedFilter | undefined, position: number) => {
  if (position <= 0) return undefined
  const row = await db
    .selectFrom(rankedRows(db, model, keys, scope, filter).as('r'))
    .selectAll()
    .where(sql<SqlBool>`r.rn = ${position}`)
    .executeTakeFirst()
  if (!row) return undefined
  return encodeCursor(keys, keys.map((_, i) => (row[`k${i}`] === null ? null : String(row[`k${i}`]))))
}
