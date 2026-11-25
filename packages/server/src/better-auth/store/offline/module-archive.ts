import { sql } from 'kysely'
import { generatedName } from '../../names/identifier-length'
import { columnId, tableId } from '../../names/identifiers'
import type { ModuleId } from '../../names/modules'
import { ddl } from '../ddl'
import { retiredSchema, watchBaseStatements, watchTrigger, watchTriggerName, wholeTable } from './retired-watch'
import type { DeferredOff, KeptModule, RetiredName } from './store-model'

// The archive of a sign-in module turned off with `--off archive` or `--off delete`, once its update is signed off:
// its tables move to a schema of their own that the app's roles cannot use, with no foreign key between them and the
// tables still on, and each column it retired from those becomes `<column>_archive`, still watched for writes.

/** A module archived: where its tables went, the columns it retired, the choice made, and the migration that archived it. */
export type ArchivedModule = {
  module: ModuleId
  step: number
  /** The store's schema, which the retired columns' tables are in; `null` when the search path decides. */
  store: string | null
  /** The schema its tables moved to (`archiveSchema`), and their names there. */
  schema: string
  tables: string[]
  columns: RetiredName[]
  choice: DeferredOff['choice']
  /** The id of the migration that archived it, which the one that deletes it names. */
  file: string
}

/** The schema the migration numbered `number` archives tables to. */
export const archiveSchema = (number: number) => `protobase_archive_${number}`

/** The name a retired column takes once archived; one past 63 bytes is shortened as Postgres would not. */
export const archivedColumn = (column: string) => generatedName(`${column}_archive`)

/** The trigger that counts the writes of an archived table. */
export const tableWatchTrigger = 'retired_writes'

const qualified = (store: string | null, table: string) => tableId(store ?? undefined, table)

/** `tables` as an array of `regclass`, for a block to compare with the catalogue. */
export const regclasses = (tables: readonly { toString: () => string }[]) => ddl`array[${sql.join(tables.map((table) => sql.lit(String(table))))}]::regclass[]`

// Drops each foreign key between one of `tables` and a table not among them, in either direction.
const dropCrossingKeys = (tables: ReturnType<typeof regclasses>) => ddl`do $archive$
declare
  found record;
begin
  for found in select conrelid::regclass as relation, conname from pg_constraint where contype = 'f' and (conrelid = any(${tables})) <> (confrelid = any(${tables})) loop
    execute format('alter table %s drop constraint %I', found.relation, found.conname);
  end loop;
end
$archive$`

/**
 * The statements that archive `kept` from the store's schema `store` to `schema`: the watch's schema, table and
 * function where missing, the foreign keys between its tables and the others dropped, its tables moved, each watched
 * as a whole, and each column it retired renamed to its archive and watched under it, counted as the column.
 */
export const archiveStatements = (store: string | null, schema: string, kept: KeptModule & { off: DeferredOff }) => {
  const tables = Object.values(kept.tables).map(({ name }) => name)
  return [
    ...watchBaseStatements(),
    ddl`create schema if not exists ${schema}`,
    dropCrossingKeys(regclasses(tables.map((table) => qualified(store, table)))),
    ...tables.map((table) => ddl`alter table ${qualified(store, table)} set schema ${schema}`),
    ...tables.map((table) => ddl`create trigger ${tableWatchTrigger} after insert or update or delete on ${tableId(schema, table)} for each row execute function ${retiredSchema}.${'count_write'}(${sql.lit(wholeTable)})`),
    ...kept.off.columns.flatMap(({ table, column }) => {
      const at = qualified(store, table)
      const archived = columnId(at, archivedColumn(column))
      return [ddl`drop trigger if exists ${watchTriggerName(column)} on ${at}`, ddl`alter table ${at} rename column ${column} to ${archived}`, watchTrigger(at, columnId(at, column), archived)]
    }),
  ]
}

/**
 * The statements that take from every role that owns or holds a privilege on a table of `schema`, and from everyone,
 * the use of the schema and of its tables and sequences, the role applying the migration included: written once the
 * file has moved every table there, which needs the schema.
 */
export const revokeStatements = (schema: string) => [
  ddl`do $revoke$
declare
  holder text;
begin
  for holder in
    select distinct holders.role::regrole::text from (
      select relowner as role from pg_class where relnamespace = ${sql.lit(schema)}::regnamespace
      union all
      select privilege.grantee from pg_class, aclexplode(relacl) as privilege where relnamespace = ${sql.lit(schema)}::regnamespace and privilege.grantee <> 0
    ) as holders
  loop
    execute format('revoke all on all tables in schema %I from %s', ${sql.lit(schema)}, holder);
    execute format('revoke all on all sequences in schema %I from %s', ${sql.lit(schema)}, holder);
    execute format('revoke all on schema %I from %s', ${sql.lit(schema)}, holder);
  end loop;
end
$revoke$`,
  ddl`revoke all on all tables in schema ${schema} from public`,
  ddl`revoke all on all sequences in schema ${schema} from public`,
  ddl`revoke all on schema ${schema} from public, current_user`,
]

/** The snapshot's record of `kept` once archived to `schema` by the migration `file`. */
export const archivedModule = (store: string | null, schema: string, kept: KeptModule & { off: DeferredOff }, file: string): ArchivedModule => ({
  module: kept.module,
  step: kept.step,
  store,
  schema,
  tables: Object.values(kept.tables).map(({ name }) => name),
  columns: kept.off.columns,
  choice: kept.off.choice,
  file,
})
