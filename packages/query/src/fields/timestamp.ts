import { invalidValue, nowExpression, type ToParam } from './sql-common'

/** Parsed RFC 3339 timestamps are sent as written, which keeps microseconds. */
export const toParam: ToParam = (value, field) => {
  if (value.kind === 'now') return nowExpression(value)
  if ((value.kind !== 'timestamp' && value.kind !== 'string') || Number.isNaN(Date.parse(value.value))) {
    throw invalidValue(field, 'an RFC 3339 timestamp')
  }
  return value.value
}
