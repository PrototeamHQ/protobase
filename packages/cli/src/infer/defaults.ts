import type { DbColumn } from '../db/model'
import type { Kind } from './type-map'

export type DefaultValue = string | number | boolean

const quoted = /^\(?'((?:[^']|'')*)'(?:::[\w. "\[\]]+)?\)?$/
const number = /^\(?(-?\d+(?:\.\d+)?)\)?(?:::\w+)?$/

// A literal default becomes `.default(value)`; anything else (now(), nextval(), ...) is left to the database.
export const parseDefault = (expression: string, kind: Kind): DefaultValue | undefined => {
  const text = expression.trim()
  if (kind.type === 'boolean') return text === 'true' ? true : text === 'false' ? false : undefined
  const quote = quoted.exec(text)?.[1]?.replaceAll("''", "'")
  const digits = number.exec(text)?.[1]
  if (kind.type === 'integer') {
    const value = digits ?? quote
    return value !== undefined && Number.isInteger(Number(value)) ? Number(value) : undefined
  }
  if (kind.type === 'bigint' || kind.type === 'decimal') return digits ?? quote
  if (kind.type === 'json') return undefined
  return quote
}

export type ColumnDefault =
  | { kind: 'none' }
  | { kind: 'literal'; value: DefaultValue }
  // The database fills the value (functions, sequences, expressions, identity); clients may still send one.
  | { kind: 'db' }
  // The database owns the value: generated columns and GENERATED ALWAYS identity.
  | { kind: 'owned' }

export const columnDefault = (column: DbColumn, kind: Kind): ColumnDefault => {
  if (column.generated || column.identityAlways) return { kind: 'owned' }
  if (column.identity) return { kind: 'db' }
  if (column.defaultExpr === undefined) return { kind: 'none' }
  const value = kind.type === 'json' ? undefined : parseDefault(column.defaultExpr, kind)
  return value === undefined ? { kind: 'db' } : { kind: 'literal', value }
}
