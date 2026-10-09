import { invalidValue, type ToParam } from './sql-common'

/** A related record's key: text, or a safe integer. */
export const toParam: ToParam = (value, field) => {
  if (value.kind === 'string') return value.value
  if (value.kind === 'number' && Number.isSafeInteger(value.value)) return value.raw
  throw invalidValue(field, 'a record key')
}
