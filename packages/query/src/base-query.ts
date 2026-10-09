import { sql, type SqlBool } from 'kysely'
import type { CheckedFilter, ResourceModel } from '@protobase/schema'
import { columnRef, tableSource } from './columns'
import { compileFilter } from './compile-filter'
import type { Db } from './db'
import { fullModelOf, tenantCondition, type Scope } from './scope'

const softDeleteColumn = (model: ResourceModel, name: string) => {
  const field = Object.hasOwn(model.fields, name) ? model.fields[name] : undefined
  return field ? columnRef(field) : sql<unknown>`${sql.id('t', name)}`
}

/**
 * The table aliased as `t`, minus soft-deleted rows, inside the tenant and the access rule's row filter,
 * narrowed by the user's filter. Every query starts here, so no query can see rows the scope hides.
 */
export const baseQuery = (db: Db, model: ResourceModel, filter?: CheckedFilter, scope?: Scope) => {
  const full = fullModelOf(model, scope)
  const softDelete = full.softDelete ?? model.softDelete
  let query = db.selectFrom(tableSource(model))
  if (softDelete) query = query.where(sql<SqlBool>`${softDeleteColumn(full, softDelete)} is null`)
  const tenant = tenantCondition(model, scope)
  if (tenant) query = query.where(tenant)
  if (scope?.rowFilter) query = query.where(compileFilter(full, scope.rowFilter))
  if (filter) query = query.where(compileFilter(model, filter))
  return query
}
