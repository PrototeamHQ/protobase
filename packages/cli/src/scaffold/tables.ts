import { connect } from '../db/connect'
import { introspect } from '../db/introspect'
import { keyColumns } from '../db/keys'
import { tableKey, type DbTable } from '../db/model'
import { authStorageSchemas, databaseMarkers, missingMarkers, serviceSchemas } from '../supabase/platform-schemas'
import { protobaseSchemas } from './protobase-tables'

/**
 * A table scaffold writes a resource over, with its number of columns and the tables among them its foreign keys point
 * to, as schema.table, whose resources its relations name.
 */
export type ScaffoldTable = { schema: string; name: string; columns: number; references: string[] }

// Whose a schema of a Supabase database is, as `import supabase` leaves it out of the app's resources.
const supabaseOwner = (schema: string) => (schema === 'auth' ? "Supabase Auth's" : schema === 'storage' ? "Supabase Storage's" : "Supabase's platform's")

/**
 * The tables of a database without a config yet that scaffold, run on all of them, writes resources over, and what it
 * leaves out, each with why: views, tables without a key, and Protobase's own tables, as one line per schema. On a
 * Supabase database, `supabase`, the platform's schemas, auth among them, are Supabase's and left out too: `supabaseSchemas`
 * names those it has, for scaffold to exclude.
 */
export const scaffoldTables = (relations: DbTable[], supabase = false) => {
  const platform = supabase ? [...authStorageSchemas, ...serviceSchemas] : []
  const supabaseSchemas = [...new Set(relations.map((relation) => relation.schema).filter((schema) => platform.includes(schema)))].sort()
  const app = relations.filter((relation) => !supabaseSchemas.includes(relation.schema))
  const protobase = protobaseSchemas(app.filter((relation) => relation.kind === 'table'), {})
  const isProtobase = (relation: DbTable) => protobase.some(({ schema, tables }) => tables.includes(relation) || (schema !== 'public' && schema === relation.schema))
  const own = app.filter((relation) => !isProtobase(relation))
  const skipped = [
    ...own.filter((relation) => relation.kind !== 'table').map((view) => `${tableKey(view)}: a ${view.kind}`),
    ...own.filter((table) => table.kind === 'table' && !keyColumns(table)).map((table) => `${tableKey(table)}: no primary key or unique NOT NULL index`),
    ...protobase.map(({ schema, what }) => `schema ${schema}: Protobase's ${what}`),
    ...supabaseSchemas.map((schema) => `schema ${schema}: ${supabaseOwner(schema)} own tables`),
  ]
  const importable = own.filter((table) => table.kind === 'table' && keyColumns(table))
  const keys = new Set(importable.map(tableKey))
  const referencesOf = (table: DbTable) => [
    ...new Set(table.foreignKeys.map((key) => tableKey({ schema: key.refSchema, name: key.refTable })).filter((key) => keys.has(key))),
  ]
  const found = importable
    .map((table): ScaffoldTable => ({ schema: table.schema, name: table.name, columns: table.columns.length, references: referencesOf(table) }))
    .sort((a, b) => tableKey(a).localeCompare(tableKey(b)))
  return { tables: found, skipped, supabaseSchemas }
}

/** `scaffoldTables` of the database at `url`, read-only; Supabase's when it has the markers `import supabase` checks. */
export const listTables = async (url: string) => {
  const sql = connect(url)
  try {
    const supabase = missingMarkers(await databaseMarkers(sql)).length === 0
    return scaffoldTables(await introspect(sql, { views: true }), supabase)
  } finally {
    await sql.end()
  }
}
