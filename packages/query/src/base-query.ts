import type { CheckedFilter, ResourceModel } from '@protobase/schema'
import { tableSource } from './columns'
import { compileFilter } from './compile-filter'
import type { Db } from './db'
import { readConditions } from './read-conditions'
import type { Scope } from './scope'

/**
 * The table aliased as `t`, minus soft-deleted rows, inside the tenant, the access rule's row filter and the parents the
 * caller reads, narrowed by the user's filter. Every query starts here, so no query can see rows the scope hides.
 */
export const baseQuery = (db: Db, model: ResourceModel, filter?: CheckedFilter, scope?: Scope) => {
  let query = db.selectFrom(tableSource(model))
  for (const condition of readConditions(model, scope)) query = query.where(condition)
  if (filter) query = query.where(compileFilter(model, filter))
  return query
}
