import { sql, type Expression, type SqlBool } from 'kysely'
import type { CheckedFilter, ResourceModel } from '@protobase/schema'
import { columnRef } from './columns'
import { QueryError } from './errors'

/**
 * Who is asking, and which rows they may see.
 * - `tenantValue`: models with a `tenant` column only ever see rows of this value.
 * - `rowFilter`: a filter from access rules, ANDed in before the user's filter. It is checked against the FULL model,
 *   so it may use hidden or non-filterable columns the user's own (restricted) model does not expose.
 * - `fullModel`: that full model. Soft delete, tenant and `rowFilter` resolve against it; everything the user
 *   supplies (filter, sort, columns, fields) resolves against the model argument. Defaults to the model argument.
 */
export type Scope = { tenantValue?: string | number; rowFilter?: CheckedFilter; fullModel?: ResourceModel }

export const fullModelOf = (model: ResourceModel, scope?: Scope) => scope?.fullModel ?? model

/** `tenant = value` for tenant models; throws when the scope is missing, so a forgotten scope never leaks rows. */
export const tenantCondition = (model: ResourceModel, scope?: Scope): Expression<SqlBool> | undefined => {
  const full = fullModelOf(model, scope)
  const tenant = full.tenant ?? model.tenant
  if (!tenant) return undefined
  if (scope?.tenantValue === undefined) {
    throw new QueryError('missing_tenant', `Resource "${model.name}" is tenant-scoped; pass scope.tenantValue`)
  }
  const field = Object.hasOwn(full.fields, tenant) ? full.fields[tenant] : undefined
  const column = field ? columnRef(field) : sql<unknown>`${sql.id('t', tenant)}`
  return sql<SqlBool>`${column} = ${scope.tenantValue}`
}
