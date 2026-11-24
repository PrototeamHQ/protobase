import type { AdminAuth } from './create-auth'
import { allModules } from './names/modules-on'
import { recordedSteps } from './store/offline/baseline-store'
import { planAdoption, storeHasTables, adoptionSql } from './store/adoption'
import { appliedVersions, stepRecordMigration, stepsOfVersions } from './store/legacy-record'
import { stepRecordSql, stepsSql } from './store/migration-sql'
import { appliedSteps, hadOf } from './store/step-record'
import { renderSteps, type Had } from './store/steps/render'
import { migrationNames } from './store/steps/step'
import { plainStoreDb } from './store/store-db'
import { storeNames, type StoreNames } from './store/store-names'

// The admin store is versioned: each module's steps ship with Protobase (`store/steps`), and `auth_steps` records each
// part of a step applied. Writing the next migration reads that record, and does not compare the store's tables with
// what Better Auth needs (only a store without a record is compared, once, to adopt it). The server reads the record
// of migrations instead (`checkMigrationRecord`).

// The parts of the modules that are on that the store lacks, each followed by its row in `auth_steps`.
const pendingSql = (names: StoreNames, had: Had) => {
  const rendered = renderSteps(migrationNames(names), names.names.modules, had)
  return rendered.length === 0 ? [] : [stepsSql(names, rendered)]
}

/**
 * The SQL that brings the admin store to this version of Protobase: the parts of the modules that are on it has not
 * applied, each followed by its row in `auth_steps`; for a store without that table, the table first. A store that
 * recorded versions of the former chain in `auth_migrations` gets its parts recorded from them; one an earlier
 * Protobase made without any record is adopted: the versions it matches are recorded as applied (`planAdoption`), the
 * others' steps follow. `undefined` when the store is current. The SQL never drops anything.
 */
export const authSchemaMigration = async (auth: AdminAuth) => {
  const names = storeNames(auth)
  const db = plainStoreDb(auth)
  const applied = await appliedSteps(db, names)
  if (applied !== undefined) return pendingSql(names, hadOf(applied))[0]
  const record = stepRecordSql(names)
  const versions = await appliedVersions(db, names)
  if (versions !== undefined) return [stepRecordMigration(names), ...pendingSql(names, hadOf(stepsOfVersions(versions)))].join('\n\n')
  if (!(await storeHasTables(db, names))) return [record, ...pendingSql(names, hadOf([]))].join('\n\n')
  const { adopted, pending } = await planAdoption(db, names)
  const rest = pending.length === 0 ? [] : pendingSql(names, hadOf(stepsOfVersions(adopted.map(({ migration }) => migration.version))))
  return [record, adoptionSql(names, adopted), ...rest].join('\n\n')
}

/**
 * The modules the config turns off whose steps the store recorded, each at its last step, which a project's first
 * snapshot keeps: the store has their tables. None for a store without a record of its steps or versions.
 */
export const keptStoreModules = async (auth: AdminAuth) => {
  const names = storeNames(auth)
  const db = plainStoreDb(auth)
  const steps = await appliedSteps(db, names)
  const versions = steps === undefined ? await appliedVersions(db, names) : undefined
  const applied = steps ?? (versions === undefined ? [] : stepsOfVersions(versions))
  const recorded = recordedSteps(applied)
  return allModules.filter((module) => !names.names.modules.includes(module) && recorded[module] !== undefined).map((module) => ({ module, step: recorded[module]! }))
}
