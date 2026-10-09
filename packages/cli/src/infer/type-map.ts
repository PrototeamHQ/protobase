import type { DbColumn } from '../db/model'

export type BaseType =
  | 'integer' | 'bigint' | 'decimal' | 'text' | 'boolean' | 'date' | 'timestamp'
  | 'uuid' | 'json' | 'enum'

export type Kind = {
  type: BaseType
  precision?: number
  scale?: number
  enumValues?: string[]
  // True when the Postgres type has no field type; it is exposed as read-only text.
  unsupported?: true
}

const simple: Record<string, BaseType> = {
  int2: 'integer',
  int4: 'integer',
  int8: 'bigint',
  text: 'text',
  varchar: 'text',
  bpchar: 'text',
  name: 'text',
  citext: 'text',
  bool: 'boolean',
  date: 'date',
  timestamp: 'timestamp',
  timestamptz: 'timestamp',
  uuid: 'uuid',
  json: 'json',
  jsonb: 'json',
}

// numeric(14,2) -> {14, 2}; an unconstrained numeric has no declared limits.
const numericLimits = (formatted: string) => {
  const match = /\((\d+),\s*(\d+)\)/.exec(formatted)
  if (!match) return { precision: 38, scale: 9 }
  return { precision: Number(match[1]), scale: Number(match[2]) }
}

const textLike = (typeName: string) => simple[typeName] === 'text'

export const inferKind = (column: DbColumn, checkValues?: string[]): Kind => {
  if (column.isEnum) return { type: 'enum', enumValues: column.enumValues }
  if (column.typeName === 'numeric') return { type: 'decimal', ...numericLimits(column.formatted) }
  const type = simple[column.typeName]
  if (!type) return { type: 'text', unsupported: true }
  if (checkValues && textLike(column.typeName)) return { type: 'enum', enumValues: checkValues }
  return { type }
}
