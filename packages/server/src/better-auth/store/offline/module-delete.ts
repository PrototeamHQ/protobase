import { sql } from 'kysely'
import { columnId, tableId, type TableId } from '../../names/identifiers'
import { ddl } from '../ddl'
import { statementsSql } from '../migration-sql'
import { archivedColumn, tableWatchTrigger, type ArchivedModule } from './module-archive'
import { retiredSchema, watchTriggerName, wholeTable } from './retired-watch'
import type { StoreModel } from './store-model'

// What `protobase migration delete` writes for a module archived: its tables and the archives of the columns it
// retired dropped, once the watch shows nothing wrote them for the period it waits.

// What the watch counts each part of the archive under, `retired.writes`' table and column, and the trigger that counts it.
const watched = (entry: ArchivedModule) => [
  ...entry.tables.map((table) => ({ table: tableId(entry.schema, table), schema: sql.lit(entry.schema), name: table, column: wholeTable, trigger: tableWatchTrigger })),
  ...entry.columns.map(({ table, column }) => ({
    table: tableId(entry.store ?? undefined, table),
    schema: entry.store === null ? sql.raw('current_schema()') : sql.lit(entry.store),
    name: table,
    column,
    trigger: watchTriggerName(archivedColumn(column)),
  })),
]

/** The message a delete refuses with while the watch counts a write of `entry` within the last `hours`. */
export const stillWritten = (entry: ArchivedModule, hours: number) => `${entry.module} was written within the last ${hours} hours, which retired.writes counts: %s. Find what still writes it, and delete it once nothing has for that long`

/**
 * The block that refuses unless every table and column archive of `entry` is watched, and the watch counts no write of
 * any within the last `hours`: a write names each one written and its count.
 */
export const unwrittenCheck = (entry: ArchivedModule, hours: number) => {
  const parts = watched(entry)
  const triggers = parts.map(({ table, trigger }) => ddl`exists (select from pg_trigger where tgrelid = ${sql.lit(String(table))}::regclass and tgname = ${sql.lit(trigger)})`)
  const keys = parts.map(({ schema, name, column }) => ddl`(format('%I.%I', ${schema}, ${sql.lit(name)}), ${sql.lit(column)})`)
  return ddl`do $unwritten$
declare
  found text;
begin
  if to_regclass(${sql.lit(`${retiredSchema}.writes`)}) is null or not (${sql.join(triggers, sql` and `)}) then
    raise exception '%', ${sql.lit(`${entry.module} has a table or column archive that retired.writes does not watch, so whether something still writes it is unknown: it is not deleted`)};
  end if;
  select string_agg(counted.table_name || '.' || counted.column_name || ' ' || counted.writes, ', ' order by counted.table_name, counted.column_name) into found
  from (
    select table_name, column_name, sum(writes) as writes from ${sql.raw(retiredSchema)}.writes
    where hour >= date_trunc('hour', now() - ${sql.lit(`${hours} hours`)}::interval) and (table_name, column_name) in (${sql.join(keys)})
    group by table_name, column_name
  ) as counted;
  if found is not null then
    raise exception '%', format(${sql.lit(stillWritten(entry, hours))}, found);
  end if;
end
$unwritten$`
}

/** The table that records the store's steps, with its module and target columns, by their names. */
export type StepRecord = { table: TableId; module: string; target: string }

/** The step record of the store `model` describes; `undefined` for one without it. */
export const stepRecordOf = (model: StoreModel): StepRecord | undefined => {
  const table = model.modules.auth?.tables.auth_steps
  if (!table) return
  return { table: tableId(model.schema ?? undefined, table.name), module: table.columns.module!, target: table.columns.target! }
}

/** The statement that forgets the steps of `module` and those applied to its tables, so it starts again from its first. */
export const forgetSteps = ({ table, module, target }: StepRecord, id: string) =>
  ddl`delete from ${table} where ${columnId(table, module)} = ${sql.lit(id)} or ${columnId(table, target)} = ${sql.lit(id)}`

/** `forgetSteps` as SQL text. */
export const forgetStepsSql = (steps: StepRecord, id: string) => statementsSql([forgetSteps(steps, id)])

/**
 * The statements that delete `entry` for good once nothing wrote it for `hours` (`unwrittenCheck`): the use of its
 * schema taken back for the role applying it, its tables dropped, and the schema once nothing else is in it, then each
 * column archive with its watch; and with `steps`, while the module is still off, its rows in `auth_steps`.
 */
export const deleteStatements = (entry: ArchivedModule, hours: number, steps: StepRecord | undefined) => [
  ddl`grant usage on schema ${entry.schema} to current_user`,
  unwrittenCheck(entry, hours),
  ddl`drop table ${sql.join(entry.tables.map((table) => tableId(entry.schema, table)))}`,
  ddl`do $empty$
begin
  if not exists (select from pg_class where relnamespace = ${sql.lit(entry.schema)}::regnamespace) then
    execute format('drop schema %I', ${sql.lit(entry.schema)});
  end if;
end
$empty$`,
  ...entry.columns.flatMap(({ table, column }) => {
    const at = tableId(entry.store ?? undefined, table)
    const archived = archivedColumn(column)
    return [ddl`drop trigger if exists ${watchTriggerName(archived)} on ${at}`, ddl`alter table ${at} drop column ${columnId(at, archived)}`]
  }),
  ...(steps ? [forgetSteps(steps, entry.module)] : []),
]
