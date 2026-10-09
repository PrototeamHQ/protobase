import { sql } from 'kysely'
import type { FieldModel, ResourceModel } from '@protobase/schema'
import { QueryError } from './errors'

export const tableAlias = 't'

export const columnRef = (field: FieldModel) => sql<unknown>`${sql.id(tableAlias, field.column)}`

export const tableSource = (model: ResourceModel) => {
  const { schema, name } = model.table
  const table = schema ? sql.id(schema, name) : sql.id(name)
  return sql`${table}`.as(tableAlias)
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
