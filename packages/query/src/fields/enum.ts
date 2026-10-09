import { invalidValue, stringValue, type ToParam } from './sql-common'

export const toParam: ToParam = (value, field) => {
  const text = stringValue(value, field, 'a string')
  if (field.enumValues && !field.enumValues.includes(text)) throw invalidValue(field, 'one of its enum values')
  return text
}
