import type { FieldModel } from '@protobase/schema'

/** The column type of a rollup or formula field, as Postgres's `format_type` names it. */
export const columnType = (field: FieldModel) => {
  if (field.type === 'integer') return 'integer'
  if (field.type === 'bigint') return 'bigint'
  if (field.type === 'decimal' && field.decimal) return `numeric(${field.decimal.precision},${field.decimal.scale})`
  throw new Error(`Not implemented: a rollup or formula column of type ${field.type}`)
}
