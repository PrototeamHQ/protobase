import { sql, type Expression, type SqlBool } from 'kysely'
import type { ResourceModel } from '@protobase/schema'
import { columnRef, tableSource } from './columns'
import { compileFilter } from './compile-filter'
import { fullModelOf, tenantCondition, type ParentRead, type Scope } from './scope'

const softDeleteColumn = (model: ResourceModel, name: string) => {
  const field = Object.hasOwn(model.fields, name) ? model.fields[name] : undefined
  return field ? columnRef(field) : sql<unknown>`${sql.id('t', name)}`
}

/**
 * `fk in (select key from parent where <the caller's scope on it>)`, or `false` when the caller reads no parent; a
 * nullable `fk` also keeps the rows that name no parent, unless this is a `related()` term, which also holds its
 * subfilter. The subquery aliases the parent `t` too, so its conditions read the parent's columns and only `fk` reads the
 * outer row.
 */
export const parentCondition = (read: ParentRead): Expression<SqlBool> => {
  const column = columnRef(read.field)
  const { parent, related } = read
  const subfilter = related?.filter ? [compileFilter(related.model, related.filter)] : []
  const within = parent
    ? sql<SqlBool>`${column} in (select ${columnRef(parent.key)} from ${tableSource(parent.model)}${whereAll([...readConditions(parent.model, parent.scope), ...subfilter])})`
    : sql<SqlBool>`false`
  return read.field.nullable && !related ? sql<SqlBool>`(${column} is null or ${within})` : within
}

const whereAll = (conditions: Expression<SqlBool>[]) => (conditions.length === 0 ? sql`` : sql` where ${sql.join(conditions, sql` and `)}`)

/** What the scope hides of the table aliased as `t`: soft-deleted rows, other tenants, the row filter and unread parents. */
export const readConditions = (model: ResourceModel, scope?: Scope): Expression<SqlBool>[] => {
  const full = fullModelOf(model, scope)
  const softDelete = full.softDelete ?? model.softDelete
  const tenant = tenantCondition(model, scope)
  return [
    ...(softDelete ? [sql<SqlBool>`${softDeleteColumn(full, softDelete)} is null`] : []),
    ...(tenant ? [tenant] : []),
    ...(scope?.rowFilter ? [compileFilter(full, scope.rowFilter)] : []),
    ...(scope?.parents ?? []).map(parentCondition),
  ]
}
