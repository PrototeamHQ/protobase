import type { FieldModel, ResourceModel } from '@protobase/schema'
import { maybe, type Condition, type Scalar } from './condition'
import type { TableRead } from './sql-reads'

/** A read a derived value depends on: the rows of a resource its condition selects, by field, and the fields it used (`null` for all). */
export type RecordedRead = { resource: string; condition: Condition; fields: string[] | null }

/** A read that names what it depends on itself: every record of `resource`, or those whose fields hold these values. */
export const namedRead = (model: ResourceModel, where: Record<string, Scalar | readonly Scalar[]> = {}): RecordedRead => {
  const parts = Object.entries(where).map(([field, value]): Condition => {
    if (!Object.hasOwn(model.fields, field)) throw new Error(`A derived value depends on "${field}" of ${model.name}, which is not a field`)
    return Array.isArray(value) ? { field, op: 'in', values: [...value] } : { field, op: '=', value: value as Scalar }
  })
  return { resource: model.name, condition: parts.length === 0 ? maybe : { and: parts }, fields: null }
}

// The condition by field name: a column that is no field is not captured, so a test of it may hold.
const byField = (condition: Condition, fields: Map<string, FieldModel>): Condition => {
  if ('maybe' in condition) return condition
  if ('and' in condition) return { and: condition.and.map((part) => byField(part, fields)) }
  if ('or' in condition) return { or: condition.or.map((part) => byField(part, fields)) }
  if ('not' in condition) return { not: byField(condition.not, fields) }
  const field = fields.get(condition.field)
  return field ? { ...condition, field: field.name } : maybe
}

const sameTable = (model: ResourceModel, read: TableRead) =>
  model.table.name === read.table && (read.schema === undefined || read.schema === (model.table.schema ?? 'public'))

/**
 * The reads of a derived value's queries as reads of resources, by field. A table that is no resource, or a resource
 * it may not read, throws, since no change to it would ever reach the value.
 */
export const resourceReads = (label: string, reads: readonly TableRead[], models: readonly ResourceModel[]): RecordedRead[] =>
  reads.map((read) => {
    const found = models.filter((model) => sameTable(model, read))
    const model = found.find((candidate) => candidate.table.schema === read.schema) ?? found[0]
    const table = read.schema ? `${read.schema}.${read.table}` : read.table
    if (!model) throw new Error(`${label} read the table ${table}, which is not a resource it reads: add its resource to the value's reads, or name what it depends on with depends() and turn tracking off`)
    const columns = new Map(Object.values(model.fields).map((field) => [field.column, field]))
    const fields = read.columns && [...new Set(read.columns.flatMap((column) => (columns.has(column) ? [columns.get(column)!.name] : [])))]
    return { resource: model.name, condition: byField(read.condition, columns), fields }
  })
