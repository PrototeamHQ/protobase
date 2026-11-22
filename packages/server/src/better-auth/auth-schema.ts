import type { AdminAuth } from './create-auth'
import { planAdoption, storeHasTables, adoptionSql } from './store/adoption'
import { migrationsTableSql, stepsSql } from './store/migration-sql'
import { appliedVersions, migrationsTable } from './store/migrations-table'
import { latestStoreVersion, legacyVersions } from './store/steps/legacy-versions'
import { renderSteps } from './store/steps/render'
import { migrationNames } from './store/steps/step'
import { plainStoreDb } from './store/store-db'
import { storeNames, type StoreNames } from './store/store-names'
import { refuseModulesOff } from './store/modules-off'

// The admin store is versioned: each module's steps ship with Protobase (`store/steps`), and `auth_migrations` records
// the versions of its former single chain applied, which each step names. Writing the next migration reads that record, and so does the check before serving: neither
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
 * The steps whose versions `applied` lacks, each version followed by its row in `auth_migrations`; written only with
 * every module on (`refuseModulesOff`).
 */
const pendingSql = (names: StoreNames, applied: number[]) => {
  const rendered = renderSteps(migrationNames(names), names.names.modules, (_module, step) => applied.includes(step.version))
  const versions = legacyVersions.map(({ version }) => version).filter((version) => !applied.includes(version))
  return rendered.length === 0 ? undefined : stepsSql(names, rendered, versions)
}

/**
 * The SQL that brings the admin store to this version of Protobase: the steps it has not applied, each version
 * followed by its row in `auth_migrations`; for a new store, that table first. A store an earlier Protobase made
 * without the record is adopted: the versions it matches are recorded as applied (`planAdoption`), the others' steps
 * follow. `undefined` when the store is current. The SQL never drops anything.
 */
export const authSchemaMigration = async (auth: AdminAuth) => {
  const names = storeNames(auth)
  refuseModulesOff(names)
  const db = plainStoreDb(auth)
  const applied = await appliedVersions(db, names)
  if (applied !== undefined) {
    refuseNewer(applied)
    return pendingSql(names, applied)
  }
  if (!(await storeHasTables(db, names))) return [migrationsTableSql(names), pendingSql(names, [])].join('\n\n')
  const { adopted, pending } = await planAdoption(db, names)
  const rest = pending.length === 0 ? [] : [pendingSql(names, adopted.map(({ migration }) => migration.version))]
  return [migrationsTableSql(names), adoptionSql(names, adopted), ...rest].join('\n\n')
}

/**
 * Refuses to go on while the admin store has not applied every migration of this version of Protobase, from its
 * `auth_migrations` alone, since every sign-in would fail. The server never changes the schema itself: the project's
 * migrations do, before the new version serves.
 */
export const checkAuthSchema = async (auth: AdminAuth) => {
  const names = storeNames(auth)
  const applied = await appliedVersions(plainStoreDb(auth), names)
  const write = `Write it as a migration with \`${authMigrationCommand}\`, apply it with the project's migrations, then start again.`
  if (applied === undefined) throw new Error(`The auth store has no ${migrationsTable(names).name} table: it is new, or an earlier Protobase made it. ${write}`)
  refuseNewer(applied)
  const missing = legacyVersions.filter((migration) => !applied.includes(migration.version))
  if (missing.length === 0) return
  throw new Error(`The auth schema is behind this version of Protobase (missing migrations ${missing.map(({ version, name }) => `${version} ${name}`).join(', ')}). ${write}`)
}
