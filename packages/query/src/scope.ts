import { sql, type Expression, type SqlBool } from 'kysely'
import type { CheckedFilter, FieldModel, ResourceModel } from '@protobase/schema'
import { columnRef } from './columns'
import { QueryError } from './errors'

/**
 * Who is asking, and which rows they may see.
 * - `tenantValue`: models with a `tenant` column only ever see rows of this value.
 * - `tenantValues`: instead, rows of any of these values, for a list across the caller's tenants; `rowFilter` then ties
 *   each tenant to its own access. An empty list sees no rows.
 * - `rowFilter`: a filter from access rules, ANDed in before the user's filter. It is checked against the FULL model,
 *   so it may use hidden or non-filterable columns the user's own (restricted) model does not expose.
 * - `parents`: the relations whose record each row belongs to (`.parent(fk, 'read')`), keeping the rows whose parent the
 *   caller reads; ANDed in with `rowFilter`.
 * - `fullModel`: that full model. Soft delete, tenant and `rowFilter` resolve against it; everything the user
 *   supplies (filter, sort, columns, fields) resolves against the model argument. Defaults to the model argument.
 */
export type Scope = { tenantValue?: string | number; tenantValues?: readonly (string | number)[]; rowFilter?: CheckedFilter; parents?: readonly ParentRead[]; fullModel?: ResourceModel }

/**
 * A relation whose parent the caller must read for a row to be seen: `field` of the full model, and the parent's full
 * model, key and the caller's scope on it; without `parent` the caller reads no parent, so only a null `field` is seen.
 */
export type ParentRead = { field: FieldModel; parent?: { model: ResourceModel; key: FieldModel; scope: Scope } }

export const fullModelOf = (model: ResourceModel, scope?: Scope) => scope?.fullModel ?? model

/**
 * `tenant = value`, or `tenant in (values)`, for tenant models; throws when the scope is missing, so a forgotten scope
 * never leaks rows.
 */
export const tenantCondition = (model: ResourceModel, scope?: Scope): Expression<SqlBool> | undefined => {
  const full = fullModelOf(model, scope)
  const tenant = full.tenant ?? model.tenant
  if (!tenant) return undefined
  const field = Object.hasOwn(full.fields, tenant) ? full.fields[tenant] : undefined
  const column = field ? columnRef(field) : sql<unknown>`${sql.id('t', tenant)}`
  if (scope?.tenantValues) {
    if (scope.tenantValues.length === 0) return sql<SqlBool>`false`
    return sql<SqlBool>`${column} in (${sql.join(scope.tenantValues)})`
  }
  if (scope?.tenantValue === undefined) {
    throw new QueryError('missing_tenant', `Resource "${model.name}" is tenant-scoped; pass scope.tenantValue`)
  }
  return sql<SqlBool>`${column} = ${scope.tenantValue}`
}
