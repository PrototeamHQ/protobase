import { sql } from 'kysely'
import { generatedName } from '../../names/identifier-length'
import type { ColumnId, TableId } from '../../names/identifiers'
import { ddl } from '../ddl'

// The watch on the columns a module turned off retires: a row trigger on each counts the writes of the code that still
// sets it, such as the version before once rolled back, by hour, in `retired.writes`. The module on again stops it.

/** The schema of the watch, made by the first migration that retires a column. */
export const retiredSchema = 'retired'

/** A column a module turned off adds to a table of a module still on. */
export type RetiredColumn = { table: TableId; column: ColumnId }

// The trigger on a column's table that counts its writes; a name past 63 bytes is shortened as Postgres would not.
const triggerName = (column: ColumnId) => generatedName(`${column.name}_retired_writes`)

const watchTable = ddl`create table if not exists ${retiredSchema}.${'writes'} (
  table_name text not null,
  column_name text not null,
  hour timestamptz not null,
  writes bigint not null,
  primary key (table_name, column_name, hour)
)`

// Runs as its owner, so a role that writes the table but not the watch still writes.
const countFunction = ddl`create or replace function ${retiredSchema}.${'count_write'}() returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $retired$
begin
  insert into retired.writes as counted (table_name, column_name, hour, writes)
  values (format('%I.%I', tg_table_schema, tg_table_name), tg_argv[0], date_trunc('hour', now()), 1)
  on conflict (table_name, column_name, hour) do update set writes = counted.writes + 1;
  return null;
end
$retired$`

/** The statements that start the watch on `columns`: its schema, table and function, then a trigger on each column. */
export const watchStatements = (columns: readonly RetiredColumn[]) => {
  if (columns.length === 0) return []
  return [
    ddl`create schema if not exists ${retiredSchema}`,
    watchTable,
    countFunction,
    ...columns.map(
      ({ table, column }) =>
        ddl`create trigger ${triggerName(column)} after insert or update of ${column} on ${table} for each row when (new.${column} is not null) execute function ${retiredSchema}.${'count_write'}(${sql.lit(column.name)})`,
    ),
  ]
}

/** The statements that stop the watch on `columns`, once their module is on again; a column retired before the watch existed has none. */
export const unwatchStatements = (columns: readonly RetiredColumn[]) => columns.map(({ table, column }) => ddl`drop trigger if exists ${triggerName(column)} on ${table}`)
