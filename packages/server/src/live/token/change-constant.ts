import type { FieldModel, FilterValue } from '@protobase/schema'

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

// A related record's key, whose type the field does not say, so sent as text for equality only, which matches an integer
// key and a text key alike: a value Postgres could read as another spelling of an integer or a uuid key is left out.
const keyText = (text: string, ordered: boolean) => {
  if (ordered) return
  if (/^\s*[+-]?\d/.test(text)) return /^-?\d+$/.test(text) && BigInt(text).toString() === text ? text : undefined
  if (/^[0-9a-f]{32}$/i.test(text.replace(/[{}-]/g, '')) && !uuidPattern.test(text)) return
  return text
}

const numericText = (value: FilterValue) => (value.kind === 'number' ? value.raw : value.kind === 'string' ? value.value : undefined)

/**
 * The value as the stream compares it with the field's column as Postgres does, for an ordering comparison when
 * `ordered`; undefined where it would compare differently: a date, a timestamp or `now()`, an order on text, booleans or
 * related keys, a number a JS number cannot hold exactly, a key of a composite relation.
 */
export const changeConstant = (field: FieldModel, value: FilterValue, ordered: boolean): Constant | undefined => {
  if (field.type === 'boolean') return value.kind === 'boolean' && !ordered ? value.value : undefined
  if (field.type === 'integer' || field.type === 'bigint') {
    const text = numericText(value)
    return text === undefined ? undefined : integerOf(text, ordered)
  }
  if (field.type === 'decimal') {
    const text = numericText(value)
    return text === undefined ? undefined : exactNumber(text)
  }
  if (field.type === 'uuid') {
    const text = value.kind === 'string' ? value.value.toLowerCase() : undefined
    return text !== undefined && uuidPattern.test(text) ? text : undefined
  }
  if (field.type === 'relation') {
    if (field.relation && field.relation.columns.length > 1) return
    const text = value.kind === 'number' ? value.raw : value.kind === 'string' ? value.value : undefined
    return text === undefined ? undefined : keyText(text, ordered)
  }
  if (textTypes.has(field.type)) return value.kind === 'string' && !ordered ? value.value : undefined
  return
}
