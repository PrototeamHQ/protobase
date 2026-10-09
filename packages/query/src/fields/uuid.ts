import { invalidValue, stringValue, type ToParam } from './sql-common'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const toParam: ToParam = (value, field) => {
  const text = stringValue(value, field, 'a UUID')
  if (!uuidPattern.test(text)) throw invalidValue(field, 'a UUID')
  return text
}
