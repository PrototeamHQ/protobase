import { invalidValue, numericText, type ToParam } from './sql-common'

export const toParam: ToParam = (value, field) => {
  const number = Number(numericText(value, field, 'a 32-bit integer'))
  if (!Number.isSafeInteger(number) || Math.abs(number) > 2 ** 31 - 1) throw invalidValue(field, 'a 32-bit integer')
  return number
}
