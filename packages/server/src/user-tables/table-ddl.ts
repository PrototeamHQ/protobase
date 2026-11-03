import { sql, type RawBuilder } from 'kysely'
import { nameProblem, userTablesSchema, type DefinitionFieldType } from './names'

/** A field as its definition row holds it: nothing in it is trusted until a statement is built from it. */
export type FieldRow = { name: unknown; type: unknown; precision: unknown; scale: unknown }

// Every name reaches SQL only through here: checked, then quoted as an identifier.
const checkedName = (name: unknown, kind: 'table' | 'field') => {
  const problem = nameProblem(name, kind)
  if (problem) throw new Error(`The ${kind} name ${JSON.stringify(name)} cannot reach SQL: ${problem}`)
  return name as string
}

const tableId = (table: unknown) => sql.id(userTablesSchema, checkedName(table, 'table'))

// A precision or scale reaches SQL as text only once it is a whole number in range.
const decimalOf = (precision: unknown, scale: unknown) => {
  if (!Number.isInteger(precision) || (precision as number) < 1 || (precision as number) > 1000) throw new Error(`The precision ${JSON.stringify(precision)} is not a whole number from 1 to 1000`)
  if (!Number.isInteger(scale) || (scale as number) < 0 || (scale as number) > (precision as number)) throw new Error(`The scale ${JSON.stringify(scale)} is not a whole number from 0 to the precision`)
  return sql.raw(`numeric(${precision as number}, ${scale as number})`)
}

const columnType = (field: FieldRow): RawBuilder<unknown> => {
  const type = field.type as DefinitionFieldType
  switch (type) {
    case 'text':
    case 'long_text':
      return sql.raw('text')
    case 'integer':
      return sql.raw('integer')
    case 'decimal':
      return decimalOf(field.precision, field.scale)
    case 'boolean':
      return sql.raw('boolean')
    case 'date':
      return sql.raw('date')
    case 'timestamp':
      return sql.raw('timestamptz')
    case 'json':
      return sql.raw('jsonb')
    default:
      throw new Error(`The field type ${JSON.stringify(field.type)} has no column type`)
  }
}

/** The index a field's column gets so its list filters and sorts: btree, a trigram one for long text, which outgrows a btree entry, and none for json. */
export const indexKind = (type: unknown): 'btree' | 'trigram' | undefined => {
  switch (type as DefinitionFieldType) {
    case 'text':
    case 'integer':
    case 'decimal':
    case 'boolean':
    case 'date':
    case 'timestamp':
      return 'btree'
    case 'long_text':
      return 'trigram'
    case 'json':
      return undefined
    default:
      throw new Error(`The field type ${JSON.stringify(type)} has no index kind`)
  }
}

/** The new table, with its key alone: its fields are added as columns. */
export const createTableSql = (table: unknown) => sql`create table ${tableId(table)} (id bigint generated always as identity primary key)`

/** The field's column: nullable and without a default, so the records already there read it as empty. */
export const addColumnSql = (table: unknown, field: FieldRow) => sql`alter table ${tableId(table)} add column ${sql.id(checkedName(field.name, 'field'))} ${columnType(field)}`

// Unnamed, so Postgres picks a name no other index has, whatever the length of the table's and the column's.
const btreeSql = (table: unknown, column: unknown) => sql`create index on ${tableId(table)} (${sql.id(checkedName(column, 'field'))})`

/** The pg_trgm index that search and text filters need on a text column. */
export const trigramIndexSql = (table: unknown, column: unknown) => sql`create index on ${tableId(table)} using gin (${sql.id(checkedName(column, 'field'))} gin_trgm_ops)`

/** The column and the index of a field added to a table. */
export const fieldSql = (table: unknown, field: FieldRow) => {
  const kind = indexKind(field.type)
  const index = kind === 'btree' ? [btreeSql(table, field.name)] : kind === 'trigram' ? [trigramIndexSql(table, field.name)] : []
  return [addColumnSql(table, field), ...index]
}
