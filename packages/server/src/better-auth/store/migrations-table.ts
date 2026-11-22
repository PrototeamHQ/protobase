import { sql, type Kysely } from 'kysely'
import { ddl } from './ddl'
import type { LegacyVersion } from './steps/legacy-versions'
import type { StoreNames } from './store-names'

// The record of the store's applied migrations, one row per version of its former single chain
// (`steps/legacy-versions.ts`), so a deploy reads where the store is without comparing its tables.

/** The table, in the store's schema, as the store's names resolve `auth_migrations`. */
export const migrationsTable = ({ names }: Pick<StoreNames, 'names'>) => names.table('auth_migrations')

/** The statement that makes the table. */
export const createMigrationsTable = (names: StoreNames) => {
  const table = migrationsTable(names)
  const { version, name, applied_at } = table.columns
  return ddl`create table ${table} (
  ${version} integer primary key,
  ${name} text not null,
  ${applied_at} timestamptz default current_timestamp not null
)`
}

/** The statement that records `migrations` as applied. */
export const recordMigrations = (names: StoreNames, migrations: LegacyVersion[]) =>
  ddl`insert into ${migrationsTable(names)} (${migrationsTable(names).columns.version}, ${migrationsTable(names).columns.name}) values ${sql.join(migrations.map(({ version, name }) => ddl`(${sql.lit(version)}, ${sql.lit(name)})`))}`

/** The versions the store has applied, in order; `undefined` when it has no migrations table. */
export const appliedVersions = async (db: Kysely<any>, names: StoreNames) => {
  const table = migrationsTable(names)
  const [found] = (await sql<{ found: boolean }>`select to_regclass(${String(table)}) is not null as found`.execute(db)).rows
  if (!found?.found) return undefined
  const { version } = table.columns
  return (await sql<{ version: number }>`select ${version} as version from ${table} order by ${version}`.execute(db)).rows.map((row) => row.version)
}
