import { sql } from 'kysely'
import type { CheckedFilter, ResourceModel } from '@protobase/schema'
import { baseQuery } from './base-query'
import type { Db } from './db'
import type { Scope } from './scope'
import { assertFilterRequirements } from './filter-requirements'
import { toNumber } from './numbers'

/** How many rows match, counting no further than `limit`: enough to tell a few rows from many without a full count. */
export const countUpTo = async (db: Db, model: ResourceModel, limit: number, filter?: CheckedFilter, scope?: Scope) => {
  await assertFilterRequirements(db, filter, scope)
  const found = baseQuery(db, model, filter, scope).select(sql`1`.as('one')).limit(limit).as('found')
  const row = await db.selectFrom(found).select(sql`count(*)::text`.as('n')).executeTakeFirstOrThrow()
  return toNumber(row.n)
}
