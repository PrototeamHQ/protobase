import { sql } from 'kysely'
import { columnRef } from './columns'
import type { Direction, SortKey } from './sort'

/**
 * ORDER BY term for a sort key. Nulls follow Postgres defaults (last for asc, first for desc), written out for
 * nullable columns so the seek predicates in seek.ts and the ordering can never drift apart.
 */
export const orderTerm = (key: SortKey, direction: Direction = key.direction) => {
  const column = columnRef(key.field)
  if (!key.field.nullable) return sql`${column} ${sql.raw(direction)}`
  return sql`${column} ${sql.raw(direction)} nulls ${sql.raw(direction === 'asc' ? 'last' : 'first')}`
}
