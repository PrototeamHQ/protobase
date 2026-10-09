import { sql, type Expression } from 'kysely'
import type { FieldModel, FilterValue } from '@protobase/schema'
import { QueryError } from './query-error'

/** Turns a checked filter value into the bound parameter (or SQL expression) compared against the column. */
export type ToParam = (value: FilterValue, field: FieldModel) => unknown

export const invalidValue = (field: FieldModel, expected: string) =>
  new QueryError('invalid_value', `Field "${field.name}" expects ${expected}`)

/** Numbers keep their written text so bigint and decimal precision is never lost to a JS double. */
export const numericText = (value: FilterValue, field: FieldModel, expected: string) => {
  if (value.kind === 'number') return value.raw
  if (value.kind === 'string') return value.value
  throw invalidValue(field, expected)
}

export const stringValue = (value: FilterValue, field: FieldModel, expected: string) => {
  if (value.kind !== 'string') throw invalidValue(field, expected)
  return value.value
}

const secondsPerUnit = { s: 1, m: 60, h: 3600, d: 86_400, w: 604_800 }

/** `now()` with its optional +/- duration offset, as a timestamptz expression. */
export const nowExpression = (value: Extract<FilterValue, { kind: 'now' }>): Expression<unknown> => {
  if (!value.offset) return sql`now()`
  const { sign, duration } = value.offset
  const seconds = duration.amount * secondsPerUnit[duration.unit]
  return sql`now() ${sql.raw(sign === '-' ? '-' : '+')} ${seconds}::float8 * interval '1 second'`
}
