import type { AdminAuth } from './create-auth'
import { planAdoption, storeHasTables, adoptionSql } from './store/adoption'
import { migrationSql, migrationsTableSql } from './store/migration-sql'
import { latestStoreVersion, storeMigrations } from './store/migrations'
import { appliedVersions, migrationsTableName } from './store/migrations-table'
import { storeDb } from './store/store-db'
import { storeNames } from './store/store-names'

// The admin store is versioned: its migrations ship with Protobase (`store/migrations`), and `auth_migrations` records
// the ones applied. Writing the next migration reads that record, and so does the check before serving: neither
// compares the store's tables with what Better Auth needs (only a store without the record is compared, once, to adopt it).

/** The command that writes the pending changes as a migration file of the project. */
export const authMigrationCommand = 'protobase auth migration'

const refuseNewer = (applied: number[]) => {
  const newest = applied.at(-1)
  if (newest !== undefined && newest > latestStoreVersion) {
    throw new Error(`The auth store is at migration ${newest}, newer than the ${latestStoreVersion} this version of Protobase knows; upgrade Protobase`)
  }
}

/**
 * The SQL that brings the admin store to this version of Protobase: the migrations it has not applied, each followed by
 * its row in `auth_migrations`; for a new store, that table first. A store an earlier Protobase made without the record
 * is adopted: the migrations it matches are recorded as applied (`planAdoption`), the others follow. `undefined` when
 * the store is current. The SQL never drops anything.
 */
export const authSchemaMigration = async (auth: AdminAuth) => {
  const names = storeNames(auth)
  const db = storeDb(auth)
  const applied = await appliedVersions(db, names)
  if (applied !== undefined) {
    refuseNewer(applied)
    const pending = storeMigrations.filter((migration) => !applied.includes(migration.version))
    return pending.length === 0 ? undefined : pending.map((migration) => migrationSql(names, migration)).join('\n\n')
  }
  if (!(await storeHasTables(db, names))) return [migrationsTableSql(names), ...storeMigrations.map((migration) => migrationSql(names, migration))].join('\n\n')
  const { adopted, pending } = await planAdoption(db, names)
  return [migrationsTableSql(names), adoptionSql(names, adopted), ...pending.map((migration) => migrationSql(names, migration))].join('\n\n')
}

/**
 * Refuses to go on while the admin store has not applied every migration of this version of Protobase, from its
 * `auth_migrations` alone, since every sign-in would fail. The server never changes the schema itself: the project's
 * migrations do, before the new version serves.
 */
export const checkAuthSchema = async (auth: AdminAuth) => {
  const applied = await appliedVersions(storeDb(auth), storeNames(auth))
  const write = `Write it as a migration with \`${authMigrationCommand}\`, apply it with the project's migrations, then start again.`
  if (applied === undefined) throw new Error(`The auth store has no ${migrationsTableName} table: it is new, or an earlier Protobase made it. ${write}`)
  refuseNewer(applied)
  const missing = storeMigrations.filter((migration) => !applied.includes(migration.version))
  if (missing.length === 0) return
  throw new Error(`The auth schema is behind this version of Protobase (missing migrations ${missing.map(({ version, name }) => `${version} ${name}`).join(', ')}). ${write}`)
}
