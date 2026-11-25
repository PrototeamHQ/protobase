import { sql } from 'kysely'
import type { ModuleDeclaration } from '../../names/declaration'
import { builtInModules, type ModuleId } from '../../names/modules'
import { allModules } from '../../names/modules-on'
import { resolveNames } from '../../names/resolve-names'
import { ddl } from '../ddl'
import { statementsSql } from '../migration-sql'
import { moduleSteps } from '../steps'
import type { StoreNames } from '../store-names'
import { unwatchStatements, watchStatements, type RetiredColumn } from './retired-watch'

// What a migration writes for a module the config turns off, and for one it turns on again after keeping its tables.

/** What becomes of a module's tables once it is off. */
export const offChoices = ['keep', 'archive', 'delete'] as const

export type OffChoice = (typeof offChoices)[number]

/** The setting `protobase migrate --force` sets in its transactions, which lets a module whose kept tables hold rows on again. */
export const forceSetting = 'protobase.force'

// Every table of every module, under the store's names.
const everyTable = (names: StoreNames) => resolveNames({ ...names.names.input, modules: allModules }).tables

// The columns a module adds that the server still writes while it is off, which stay required: a personal access
// token made while organizations are off after being on is made in the default organization.
const writtenWhileOff: Partial<Record<ModuleId, Record<string, readonly string[]>>> = { organizations: { personal_access_token: ['organization_id'] } }

/**
 * The columns `module` adds to the tables of the modules that stay on, which retire once it is off: each table one of
 * `existing`, whose tables the store has before the migration; a column the server still writes while it is off stays
 * in use (`writtenWhileOff`). A table of a module turned on in the same migration is made without the column. The user
 * table is left alone when it is a relation Protobase did not make.
 */
export const retiredColumns = (names: StoreNames, module: ModuleId, existing: readonly ModuleId[], externalUser = names.users.keyTable !== undefined): RetiredColumn[] => {
  const every = everyTable(names)
  const declaration = builtInModules.find(({ id }) => id === module) as ModuleDeclaration
  return Object.entries(declaration.columns ?? {})
    .filter(([table]) => {
      const kept = names.names.tables[table]
      return kept !== undefined && existing.includes(kept.module) && !(table === 'user' && externalUser)
    })
    .flatMap(([table, columns]) =>
      Object.keys(columns)
        .filter((column) => !writtenWhileOff[module]?.[table]?.includes(column))
        .map((column) => ({ table: every[table]!, column: every[table]!.columns[column]! })),
    )
}

/**
 * The statements that keep `module`'s tables and rows while it is off: each column it retires (`retiredColumns`) loses
 * `not null`, so the code that no longer writes it still inserts rows, and is watched for the writes of the code that
 * still does (`watchStatements`).
 */
export const keepStatements = (names: StoreNames, module: ModuleId, existing: readonly ModuleId[], externalUser?: boolean) => {
  const columns = retiredColumns(names, module, existing, externalUser)
  return [...columns.map(({ table, column }) => ddl`alter table ${table} alter column ${column} drop not null`), ...watchStatements(columns)]
}

/** The tables of `module` its steps up to `step` made, under the store's names. */
export const keptTables = (names: StoreNames, module: ModuleId, step: number) => {
  const every = everyTable(names)
  return moduleSteps[module].filter((made) => made.step <= step).flatMap((made) => made.tables.map((table) => every[table]!))
}

/** The message that refuses turning `module` on again while its kept tables hold rows: `found` lists each table with its count. */
export const revivalRefusal = (module: ModuleId, found: string) =>
  `The ${module} module was kept while off, and its tables still hold rows: ${found}. Turning it on again brings them back into use, such as personal access tokens, which act again for their users: delete them in a migration of the project's own written before this one, or apply with \`protobase migrate --force\` to bring them back`

/**
 * The block that refuses, before the steps, to turn `module` on again while the tables it kept at `step` hold rows,
 * naming each table with its count; `protobase migrate --force` lets it through. Empty tables pass.
 */
export const revivalCheckSql = (names: StoreNames, module: ModuleId, step: number) => {
  const counts = keptTables(names, module, step).map((table) => ddl`select ${sql.lit(table.name)} as name, (select count(*) from ${table}) as rows`)
  const check = ddl`do $revive$
declare
  found text;
begin
  if coalesce(current_setting(${sql.lit(forceSetting)}, true), '') <> 'true' then
    select string_agg(counted.name || ' ' || counted.rows, ', ' order by counted.name) into found
    from (${sql.join(counts, sql` union all `)}) as counted
    where counted.rows > 0;
    if found is not null then
      raise exception '%', format(${sql.lit(revivalRefusal(module, '%s'))}, found);
    end if;
  end if;
end
$revive$`
  return `-- ${module} on again: its kept tables must be empty, or the migration applied with \`protobase migrate --force\`.\n${statementsSql([check])}`
}

/** The statements that keep `module` while off, as SQL text under a comment naming it; none when there are none. */
export const keepSql = (names: StoreNames, module: ModuleId, existing: readonly ModuleId[], externalUser?: boolean) => {
  const statements = keepStatements(names, module, existing, externalUser)
  if (statements.length === 0) return `-- ${module} off: its tables and rows are kept as they are.`
  return `-- ${module} off: its tables and rows are kept, and the columns it adds to the tables of the modules that are on may stay empty, watched for writes in retired.writes.\n${statementsSql(statements)}`
}

/**
 * The statements that stop the watch on the columns `module` retired, as it turns on again, whose values they kept;
 * none when it retired none.
 */
export const unwatchSql = (names: StoreNames, module: ModuleId, existing: readonly ModuleId[], externalUser?: boolean) => {
  const statements = unwatchStatements(retiredColumns(names, module, existing, externalUser))
  if (statements.length === 0) return
  return `-- ${module} on again: the columns it adds are in use again, with the values they kept, and no longer watched.\n${statementsSql(statements)}`
}
