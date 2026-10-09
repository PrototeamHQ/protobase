import { invalidValue, numericText, type ToParam } from './sql-common'

const int64Max = 2n ** 63n - 1n

/** Sent as text so no precision is lost. */
export const toParam: ToParam = (value, field) => {
  const text = numericText(value, field, 'a 64-bit integer')
  if (!/^-?\d{1,19}$/.test(text)) throw invalidValue(field, 'a 64-bit integer')
  const parsed = BigInt(text)
  if (parsed > int64Max || parsed < -int64Max - 1n) throw invalidValue(field, 'a 64-bit integer')
  return text
}
