import { sql, type Kysely } from 'kysely'
import { ddl, ddlText } from './ddl'
import type { StoreMigration } from './migrations/migration'
import { storeTable, type StoreNames } from './store-names'

// The record of the store's applied migrations, one row per version, so a deploy reads where the store is without
// comparing its tables.

/** The table, in the store's schema. */
export const migrationsTableName = 'auth_migrations'

const migrationsTable = (names: StoreNames) => storeTable(names, migrationsTableName)

/** The statement that makes the table. */
export const createMigrationsTable = (names: StoreNames) =>
  ddl`create table ${migrationsTable(names)} (
  version integer primary key,
  name text not null,
  applied_at timestamptz default current_timestamp not null
)`

/** The statement that records `migrations` as applied. */
export const recordMigrations = (names: StoreNames, migrations: StoreMigration[]) =>
  ddl`insert into ${migrationsTable(names)} (version, name) values ${sql.join(migrations.map(({ version, name }) => ddl`(${sql.lit(version)}, ${sql.lit(name)})`))}`

/** The versions the store has applied, in order; `undefined` when it has no migrations table. */
export const appliedVersions = async (db: Kysely<any>, names: StoreNames) => {
  const [found] = (await sql<{ found: boolean }>`select to_regclass(${ddlText(migrationsTable(names))}) is not null as found`.execute(db)).rows
  if (!found?.found) return undefined
  return (await sql<{ version: number }>`select version from ${migrationsTable(names)} order by version`.execute(db)).rows.map((row) => row.version)
}
