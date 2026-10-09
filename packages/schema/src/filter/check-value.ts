import type { FieldModel, FilterValue } from '../model'
import { isValidDate, isValidTimestamp } from './datetime'

export type Problem = { message: string; hint: string }

const problem = (message: string, hint: string): Problem => ({ message, hint })

const int64Min = -(2n ** 63n)
const int64Max = 2n ** 63n - 1n
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Numbers may be written as number literals or quoted strings; precision lives in the text.
const numericText = (value: FilterValue) =>
  value.kind === 'number' ? value.raw : value.kind === 'string' ? value.value : undefined

const expected = (what: string, hint = `Write ${what} values like the examples in the docs`) =>
  problem(`Expected ${what}`, hint)

const checkInteger = (value: FilterValue) => {
  const text = numericText(value)
  const number = text === undefined ? NaN : Number(text)
  if (text === undefined || text.trim() === '' || !Number.isSafeInteger(number)) {
    return expected('a whole number', 'Use an integer such as 42, or a bigint field for larger values')
  }
}

const checkBigint = (value: FilterValue) => {
  const text = numericText(value)
  if (text === undefined || !/^-?\d+$/.test(text) || BigInt(text) < int64Min || BigInt(text) > int64Max) {
    return expected('a 64-bit integer', 'Use plain digits such as 9007199254740993 (no exponent or fraction)')
  }
}

const checkDecimal = (value: FilterValue) => {
  const text = numericText(value)
  if (text === undefined || !/^-?\d+(\.\d+)?$/.test(text)) {
    return expected('a decimal number', 'Use plain digits such as 100.50, or quote it: "100.50" (no exponent)')
  }
}

export const checkValue = (field: FieldModel, value: FilterValue): Problem | undefined => {
  if (value.kind === 'now') {
    if (field.type === 'date' || field.type === 'timestamp') return undefined
    return problem('now() only works with date and timestamp fields', `Field "${field.name}" is ${field.type}`)
  }
  switch (field.type) {
    case 'text':
      if (value.kind !== 'string') return expected('a quoted string', 'Wrap the text in double quotes')
      return undefined
    case 'integer':
      return checkInteger(value)
    case 'bigint':
      return checkBigint(value)
    case 'decimal':
      return checkDecimal(value)
    case 'boolean':
      return value.kind === 'boolean' ? undefined : expected('true or false')
    case 'date':
      if (value.kind === 'string' && isValidDate(value.value)) return undefined
      return expected('a date', 'Quote a calendar date: "2012-04-21"')
    case 'timestamp':
      if (value.kind === 'timestamp' || (value.kind === 'string' && isValidTimestamp(value.value))) return undefined
      return expected('an RFC-3339 timestamp', 'Use 2012-04-21T11:30:00Z, or now() - 7d')
    case 'uuid':
      if (value.kind === 'string' && uuid.test(value.value)) return undefined
      return expected('a uuid', 'Quote a uuid like "0b5a4f0e-6f2a-4a3c-9d4e-1f2a3b4c5d6e"')
    case 'enum':
      if (value.kind === 'string' && field.enumValues?.includes(value.value)) return undefined
      return problem('Invalid enum value', `Allowed values: ${(field.enumValues ?? []).join(', ')}`)
    case 'currency':
      if (value.kind === 'string' && /^[A-Z]{3}$/.test(value.value)) return undefined
      return expected('an ISO 4217 currency code', 'Use three capital letters, for example "EUR"')
    case 'country':
      if (value.kind === 'string' && /^[A-Z]{2}$/.test(value.value)) return undefined
      return expected('an ISO 3166-1 country code', 'Use two capital letters, for example "NL"')
    case 'relation':
      if (value.kind === 'string' || (value.kind === 'number' && Number.isSafeInteger(value.value))) return undefined
      return expected('a record key', 'Use the related record key: 42 or "abc"')
    case 'json':
    case 'file':
      return problem(`${field.type} fields cannot be compared`, 'Use field:value on json fields, or isNull(field)')
  }
}
