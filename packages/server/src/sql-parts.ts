import { sql, type Expression, type SqlBool } from 'kysely'
import { compileFilter } from '@protobase/query'
import type { CheckedFilter, FieldModel, ResourceModel } from '@protobase/schema'
import type { Entry } from './registry'
import type { TenantValue } from './types'

export const etagAlias = '__pb_etag'

export const tableId = (model: ResourceModel) => {
  const { schema, name } = model.table
  return schema ? sql.id(schema, name) : sql.id(name)
}

export const columnId = (field: FieldModel) => sql<unknown>`${sql.id(field.column)}`

export const aliasedColumn = (field: FieldModel) => sql`${columnId(field)} as ${sql.id(field.name)}`

/** `column as "field"` for the given fields (default: all), plus the ETag source column as exact text when the table has one. */
export const returningList = (entry: Entry, fields: FieldModel[] = Object.values(entry.model.fields)) => {
  const columns = fields.map(aliasedColumn)
  if (entry.etag) columns.push(sql`${columnId(entry.etag.field)}::text as ${sql.id(etagAlias)}`)
  return sql.join(columns)
}

const columnNamed = (model: ResourceModel, name: string) => {
  const field = Object.hasOwn(model.fields, name) ? model.fields[name] : undefined
  return field ? columnId(field) : sql<unknown>`${sql.id(name)}`
}

export type DeletedRows = 'hide' | 'show' | 'only'

/** Rows of the caller's tenant, live ones unless `deleted` says otherwise: the conditions every statement on a resource starts with. */
export const scopeConditions = (model: ResourceModel, tenant?: TenantValue, deleted: DeletedRows = 'hide') => {
  const conditions: Expression<SqlBool>[] = []
  if (model.softDelete && deleted !== 'show') {
    conditions.push(sql<SqlBool>`${columnNamed(model, model.softDelete)} is ${sql.raw(deleted === 'only' ? 'not null' : 'null')}`)
  }
  if (model.tenant && tenant !== undefined) conditions.push(sql<SqlBool>`${columnNamed(model, model.tenant)} = ${tenant}`)
  return conditions
}

export const keyConditions = (model: ResourceModel, key: readonly (string | number)[]) =>
  model.primaryKey.map((name, i) => sql<SqlBool>`${columnId(model.fields[name]!)} = ${key[i]!}`)

export const filterCondition = (model: ResourceModel, filter?: CheckedFilter) =>
  filter ? [compileFilter(model, filter)] : []

export const whereClause = (conditions: Expression<SqlBool>[]) =>
  conditions.length === 0 ? sql`` : sql` where ${sql.join(conditions, sql` and `)}`
