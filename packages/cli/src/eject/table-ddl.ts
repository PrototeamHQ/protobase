import type { Sql } from '../db/connect'
import type { DbTable } from '../db/model'

/** What the catalogue says of a table beyond its columns: each constraint but NOT NULL, and each index no constraint makes, as Postgres writes them. */
export type TableDdl = {
  constraints: Array<{ name: string; definition: string }>
  indexes: string[]
}

/** The constraints and indexes of `table`, read from the catalogue; the primary key first, the rest by name. */
export const readTableDdl = async (sql: Sql, table: Pick<DbTable, 'schema' | 'name'>): Promise<TableDdl> => {
  const constraints = await sql<{ name: string; definition: string }[]>`
    select c.conname as name, pg_get_constraintdef(c.oid) as definition from pg_constraint c
    where c.conrelid = format('%I.%I', ${table.schema}::text, ${table.name}::text)::regclass and c.contype <> 'n' order by c.contype <> 'p', c.conname`
  const indexes = await sql<{ definition: string }[]>`
    select pg_get_indexdef(i.indexrelid) as definition from pg_index i join pg_class ic on ic.oid = i.indexrelid
    where i.indrelid = format('%I.%I', ${table.schema}::text, ${table.name}::text)::regclass and not exists (select from pg_constraint c where c.conindid = i.indexrelid and c.conrelid = i.indrelid)
    order by ic.relname`
  return { constraints: [...constraints], indexes: indexes.map((index) => index.definition) }
}
