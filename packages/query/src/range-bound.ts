import type { FieldModel } from '@protobase/schema'
import { QueryError } from './errors'

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timestampPattern = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?)?(Z|[+-]\d{2}(:?\d{2})?)?$/

/** Validates a series range bound: a Date or ISO text (dates only for `date` fields). Returns text to bind. */
export const rangeBound = (value: string | Date, field: FieldModel) => {
  const wantsDate = field.type === 'date'
  const text = value instanceof Date ? value.toISOString() : value
  const pattern = wantsDate ? datePattern : timestampPattern
  const date = wantsDate && value instanceof Date ? text.slice(0, 10) : text
  if (!pattern.test(date) || Number.isNaN(Date.parse(date))) {
    throw new QueryError('invalid_option', `Range bounds for "${field.name}" must be ${wantsDate ? 'YYYY-MM-DD dates' : 'ISO 8601 timestamps'}`)
  }
  return date
}
