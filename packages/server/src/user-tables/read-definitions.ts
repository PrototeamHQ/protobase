import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { definitionsSchema, userTablesSchema } from './names'

/** A field of a stored definition, as its row holds it: nothing in it is trusted before `checkDefinition`. */
export type StoredField = { name: string; label: string; type: string; required: boolean; precision: number | null; scale: number | null }

/** A stored definition of a table users add, as its rows hold it, with its fields in order. */
export type StoredDefinition = { id: string; name: string; singular_label: string; plural_label: string; title_field: string | null; version: string; fields: StoredField[] }

/** A column of a table in the user tables schema: its type without modifiers, whether it is NOT NULL and the whole primary key. */
export type StoredColumn = { type: string; notNull: boolean; key: boolean }

/** The columns of each table in the user tables schema, by table and column name. */
export type UserTableColumns = Map<string, Map<string, StoredColumn>>

/** The stored definitions, by id, each with its fields by position. */
export const readDefinitions = async (db: Db): Promise<StoredDefinition[]> => {
  const { rows } = await sql<StoredDefinition>`select t.id::text as id, t.name, t.singular_label, t.plural_label, t.title_field, t.version::text as version,
      coalesce((select json_agg(json_build_object('name', f.name, 'label', f.label, 'type', f.type, 'required', f.required, 'precision', f.precision, 'scale', f.scale) order by f.position, f.name)
        from ${sql.table(`${definitionsSchema}.fields`)} f where f.table_id = t.id), '[]') as fields
    from ${sql.table(`${definitionsSchema}.tables`)} t order by t.id`.execute(db)
  return rows
}

/** The columns of the tables of the user tables schema, from the catalogue. */
export const readUserTableColumns = async (db: Db): Promise<UserTableColumns> => {
  const { rows } = await sql<{ table: string; column: string; type: string; not_null: boolean; key: boolean }>`select c.relname::text as table, a.attname::text as column,
      format_type(a.atttypid, null) as type, a.attnotnull as not_null,
      exists (select from pg_index i where i.indrelid = c.oid and i.indisprimary and i.indnatts = 1 and i.indkey[0] = a.attnum) as key
    from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid
    where n.nspname = ${userTablesSchema} and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
    order by c.relname, a.attnum`.execute(db)
  const tables: UserTableColumns = new Map()
  for (const row of rows) {
    const columns = tables.get(row.table) ?? new Map<string, StoredColumn>()
    columns.set(row.column, { type: row.type, notNull: row.not_null, key: row.key })
    tables.set(row.table, columns)
  }
  return tables
}
