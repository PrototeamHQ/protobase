import { sql } from 'kysely'
import type { CheckedFilter, ResourceModel } from '@protobase/schema'
import { baseQuery } from './base-query'
import type { Db } from './db'
import type { Scope } from './scope'
import { assertFilterRequirements } from './filter-requirements'
import { toNumber } from './numbers'

/** Runs a real count(*); call only when the user asks for an exact total. */
export const exactCount = async (db: Db, model: ResourceModel, filter?: CheckedFilter, scope?: Scope) => {
  await assertFilterRequirements(db, filter, scope)
  const row = await baseQuery(db, model, filter, scope).select(sql`count(*)::text`.as('n')).executeTakeFirstOrThrow()
  return toNumber(row.n)
}
