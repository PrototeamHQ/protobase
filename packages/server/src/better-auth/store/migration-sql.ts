import type { RawBuilder } from 'kysely'
import { ddl, ddlText } from './ddl'
import { migrationNames, type StoreMigration } from './migrations/migration'
import { createMigrationsTable, recordMigrations } from './migrations-table'
import type { StoreNames } from './store-names'

// The text a migration file of the project holds: each statement ends with a semicolon, a blank line between them.

/** The statements as SQL text. */
export const statementsSql = (statements: RawBuilder<unknown>[]) => statements.map((statement) => `${ddlText(statement)};`).join('\n\n')

/** A migration's statements, then the row that records it, under a comment naming it. */
export const migrationSql = (names: StoreNames, migration: StoreMigration) =>
  `-- ${migration.version} ${migration.name}: ${migration.title}.\n${statementsSql([...migration.statements(migrationNames(names)), recordMigrations(names, [migration])])}`

/** The migrations table, for a store that has none yet, in the store's schema, made when it is missing. */
export const migrationsTableSql = (names: StoreNames) => {
  const schema = names.schema === undefined ? [] : [ddl`create schema if not exists ${names.schema}`]
  return `-- The record of the auth store's migrations.\n${statementsSql([...schema, createMigrationsTable(names)])}`
}
