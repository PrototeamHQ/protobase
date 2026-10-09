import { invalidValue, numericText, type ToParam } from './sql-common'

export const toParam: ToParam = (value, field) => {
  const text = numericText(value, field, 'a decimal number')
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw invalidValue(field, 'a decimal number')
  return text
}
