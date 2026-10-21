import { sql } from 'kysely'
import type { ResourceModel } from '@protobase/schema'
import { columnRef, findField } from './columns'
import { QueryError } from './errors'

const numericTypes = ['integer', 'bigint', 'decimal']

/** What a group adds up besides its count: the sum, the average or the maximum of a numeric field over its rows. */
export type Measure = { kind: 'sum' | 'average' | 'maximum'; field: string }

const aggregates = { sum: 'sum', average: 'avg', maximum: 'max' }

/** The SQL aggregate of a measure; select it `::text`, so a decimal keeps its digits until it is read. */
export const measureSql = (model: ResourceModel, measure: Measure) => {
  const field = findField(model, measure.field)
  if (!numericTypes.includes(field.type)) {
    throw new QueryError('unsupported_field_type', `A ${measure.kind} needs a numeric field, "${measure.field}" is ${field.type}`)
  }
  // A sensitive value never leaves the server, not even added up
  if (field.sensitive) throw new QueryError('unsupported_field_type', `"${measure.field}" is sensitive, so it cannot be added up`)
  const column = columnRef(field)
  return sql`${sql.raw(aggregates[measure.kind])}(${column})`
}

/** A measure's value: `null` when no row of the group has a value to add up. */
export const measureValue = (raw: unknown) => (raw === null || raw === undefined ? null : Number(raw))
