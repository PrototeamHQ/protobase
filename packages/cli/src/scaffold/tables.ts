import { connect } from '../db/connect'
import { introspect } from '../db/introspect'
import { keyColumns } from '../db/keys'
import { tableKey, type DbTable } from '../db/model'
import { protobaseSchemas } from './protobase-tables'

/**
 * A table scaffold writes a resource over, with its number of columns and the tables among them its foreign keys point
 * to, as schema.table, whose resources its relations name.
 */
export type ScaffoldTable = { schema: string; name: string; columns: number; references: string[] }

/**
 * The tables of a database without a config yet that scaffold, run on all of them, writes resources over, and what it
 * leaves out, each with why: views, tables without a key, and Protobase's own tables, as one line per schema.
 */
export const scaffoldTables = (relations: DbTable[]) => {
  const tables = relations.filter((relation) => relation.kind === 'table')
  const protobase = protobaseSchemas(tables, {})
  const isProtobase = (relation: DbTable) => protobase.some(({ schema, tables }) => tables.includes(relation) || (schema !== 'public' && schema === relation.schema))
  const own = relations.filter((relation) => !isProtobase(relation))
  const skipped = [
    ...own.filter((relation) => relation.kind !== 'table').map((view) => `${tableKey(view)}: a ${view.kind}`),
    ...own.filter((table) => table.kind === 'table' && !keyColumns(table)).map((table) => `${tableKey(table)}: no primary key or unique NOT NULL index`),
    ...protobase.map(({ schema, what }) => `schema ${schema}: Protobase's ${what}`),
  ]
  const importable = own.filter((table) => table.kind === 'table' && keyColumns(table))
  const keys = new Set(importable.map(tableKey))
  const referencesOf = (table: DbTable) => [
    ...new Set(table.foreignKeys.map((key) => tableKey({ schema: key.refSchema, name: key.refTable })).filter((key) => keys.has(key))),
  ]
  const found = importable
    .map((table): ScaffoldTable => ({ schema: table.schema, name: table.name, columns: table.columns.length, references: referencesOf(table) }))
    .sort((a, b) => tableKey(a).localeCompare(tableKey(b)))
  return { tables: found, skipped }
}

/** `scaffoldTables` of the database at `url`, read in one read-only session. */
export const listTables = async (url: string) => {
  const sql = connect(url)
  try {
    return scaffoldTables(await introspect(sql, { views: true }))
  } finally {
    await sql.end()
  }
}
