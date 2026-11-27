import type { FieldType, FilterValue } from '@protobase/schema'

/** A value the change stream compares a column's text with: a number numerically, a string byte by byte, a boolean as `t` or `f`. */
export type Constant = string | number | boolean

// Types stored as text: equal exactly when their bytes are, as the stream compares; their order is the database's collation, which it does not follow.
const textTypes = new Set(['text', 'enum', 'currency', 'country', 'mail_sender'])

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// A number the stream reads exactly as written: what a JS number prints back once leading and trailing zeros go.
const exactNumber = (text: string) => {
  if (!/^-?\d+(\.\d+)?$/.test(text)) return
  const plain = text.replace(/^(-?)0+(?=\d)/, '$1').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
  const number = Number(plain)
  return String(number) === plain ? number : undefined
}

// An integer as Postgres prints it, which a string compares equal with byte by byte where a JS number would round it.
const integerOf = (text: string, ordered: boolean) => {
  if (!/^-?\d+$/.test(text)) return
  const canonical = BigInt(text).toString()
  if (Number.isSafeInteger(Number(canonical))) return Number(canonical)
  return ordered ? undefined : canonical
}

const numericText = (value: FilterValue) => (value.kind === 'number' ? value.raw : value.kind === 'string' ? value.value : undefined)

/**
 * The value as the stream compares it with a column of `type` as Postgres does, for an ordering comparison when
 * `ordered`; undefined where it would compare differently: a date, a timestamp or `now()`, an order on text or booleans,
 * a number a JS number cannot hold exactly. A relation's column compares as the type of the key it points at.
 */
export const changeConstant = (type: FieldType, value: FilterValue, ordered: boolean): Constant | undefined => {
  if (type === 'boolean') return value.kind === 'boolean' && !ordered ? value.value : undefined
  if (type === 'integer' || type === 'bigint') {
    const text = numericText(value)
    return text === undefined ? undefined : integerOf(text, ordered)
  }
  if (type === 'decimal') {
    const text = numericText(value)
    return text === undefined ? undefined : exactNumber(text)
  }
  if (type === 'uuid') {
    const text = value.kind === 'string' ? value.value.toLowerCase() : undefined
    return text !== undefined && uuidPattern.test(text) ? text : undefined
  }
  if (textTypes.has(type)) return value.kind === 'string' && !ordered ? value.value : undefined
  return
}
