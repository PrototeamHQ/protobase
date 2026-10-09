import { invalidValue, type ToParam } from './sql-common'

export const toParam: ToParam = (value, field) => {
  if (value.kind !== 'boolean') throw invalidValue(field, 'a boolean')
  return value.value
}
