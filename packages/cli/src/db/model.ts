export type DbColumn = {
  name: string
  position: number
  // Base type name, resolved through domains (int4, text, numeric, an enum name, ...).
  typeName: string
  // format_type output, e.g. numeric(14,2) or character(1).
  formatted: string
  isEnum: boolean
  enumValues: string[]
  notNull: boolean
  identity: boolean
  // GENERATED ALWAYS AS IDENTITY: the database refuses explicit values.
  identityAlways: boolean
  generated: boolean
  defaultExpr?: string
}

export type DbForeignKey = {
  columns: string[]
  refSchema: string
  refTable: string
  refColumns: string[]
}

export type DbIndex = {
  name: string
  // Key columns in order; null marks an expression.
  columns: (string | null)[]
  unique: boolean
  primary: boolean
  partial: boolean
  method: string
}

export type DbCheck = {
  columns: string[]
  definition: string
}

export type DbTable = {
  schema: string
  name: string
  kind: 'table' | 'view' | 'materialized view'
  columns: DbColumn[]
  foreignKeys: DbForeignKey[]
  indexes: DbIndex[]
  checks: DbCheck[]
}

export const tableKey = (table: { schema: string; name: string }) => `${table.schema}.${table.name}`
