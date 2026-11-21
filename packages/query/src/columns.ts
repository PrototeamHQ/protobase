import { sql, type Expression, type RawBuilder, type SqlBool } from 'kysely'
import type { FieldModel, ResourceModel } from '@protobase/schema'
import { QueryError } from './errors'
import { lookupReadOf, type LookupRead } from './lookup-read'

export const tableAlias = 't'

export const tableSource = (model: ResourceModel) => {
  const { schema, name } = model.table
  const table = schema ? sql.id(schema, name) : sql.id(name)
  return sql`${table}`.as(tableAlias)
}

const whereAll = (conditions: Expression<SqlBool>[]) => (conditions.length === 0 ? sql`` : sql` where ${sql.join(conditions, sql` and `)}`)

/**
 * A lookup field's value: the linked field of the one linked record the caller reads, or null. The linked table is
 * aliased `t` inside its own subquery, so its conditions read its columns, and only the link reads the outer row.
 */
const lookupValue = (read: LookupRead) => {
  const linked = sql`select ${sql.id(tableAlias, read.match.column)} as k, ${sql.id(tableAlias, read.value.column)} as v from ${tableSource(read.model)}${whereAll(read.conditions)}`
  return sql<unknown>`(select l.v from (${linked}) as l where l.k = ${columnRef(read.link)})`
}

/** The column of a field of the table aliased `t`, or a lookup field's value. */
export const columnRef = (field: FieldModel): RawBuilder<unknown> => {
  const read = lookupReadOf(field)
  return read ? lookupValue(read) : sql<unknown>`${sql.id(tableAlias, field.column)}`
}

export const findField = (model: ResourceModel, name: string) => {
  const field = Object.hasOwn(model.fields, name) ? model.fields[name] : undefined
  if (!field) throw new QueryError('unknown_field', `Unknown field "${name}" on resource "${model.name}"`)
  return field
}

export const requireField = (model: ResourceModel, name: string, capability: 'filterable' | 'sortable') => {
  const field = findField(model, name)
  if (field[capability]) return field
  throw new QueryError(
    capability === 'filterable' ? 'not_filterable' : 'not_sortable',
    `Field "${name}" is not ${capability}`,
  )
}

/** Primary key entries may name a field or its column. */
export const primaryKeyFields = (model: ResourceModel) =>
  model.primaryKey.map(key => {
    const field = Object.hasOwn(model.fields, key)
      ? model.fields[key]
      : Object.values(model.fields).find(candidate => candidate.column === key)
    if (!field) throw new QueryError('unknown_field', `Primary key "${key}" is not a field of "${model.name}"`)
    return field
  })
