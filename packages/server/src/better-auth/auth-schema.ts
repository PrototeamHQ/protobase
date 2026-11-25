import type { AdminAuth } from './create-auth'
import { allModules } from './names/modules-on'
import { recordedSteps } from './store/offline/baseline-store'
import { keptModule } from './store/offline/store-model'
import { planAdoption, storeHasTables, adoptionSql } from './store/adoption'
import { refuseVersionRecord, stepsOfVersions } from './store/legacy-record'
import { stepRecordSql, stepsSql } from './store/migration-sql'
import { appliedSteps, hadOf } from './store/step-record'
import { renderSteps, type Had } from './store/steps/render'
import { migrationNames, organizationsInput } from './store/steps/step'
import { plainStoreDb } from './store/store-db'
import { storeNames, type StoreNames } from './store/store-names'

// The admin store is versioned: each module's steps ship with Protobase (`store/steps`), and `auth_steps` records each
// part of a step applied. Writing the next migration reads that record, and does not compare the store's tables with
// what Better Auth needs (only a store without a record is compared, once, to adopt it). The server reads the record
// of migrations instead (`checkMigrationRecord`).

// The parts of the modules that are on that the store lacks, each followed by its row in `auth_steps`.
const pendingSql = (auth: AdminAuth, names: StoreNames, had: Had) => {
  const rendered = renderSteps(migrationNames(names), names.names.modules, had, organizationsInput(auth.organizations?.options))
  return rendered.length === 0 ? [] : [stepsSql(names, rendered)]
}

/**
 * The SQL that brings the admin store to this version of Protobase: the parts of the modules that are on it has not
 * applied, each followed by its row in `auth_steps`; for a store without that table, the table first. A store that
 * records versions of the former chain instead is refused (`refuseVersionRecord`); one an earlier Protobase made
 * without any record is adopted: the versions it matches are recorded as applied (`planAdoption`), the
 * others' steps follow. `undefined` when the store is current. The SQL drops nothing but the former record of versions
 * (`steps/auth/006-drop-version-record.ts`).
 */
export const authSchemaMigration = async (auth: AdminAuth) => {
  const names = storeNames(auth)
  const db = plainStoreDb(auth)
  const applied = await appliedSteps(db, names)
  if (applied !== undefined) return pendingSql(auth, names, hadOf(applied))[0]
  await refuseVersionRecord(db, names)
  const record = stepRecordSql(names)
  if (!(await storeHasTables(db, names))) return [record, ...pendingSql(auth, names, hadOf([]))].join('\n\n')
  const { adopted, pending } = await planAdoption(db, names)
  const rest = pending.length === 0 ? [] : pendingSql(auth, names, hadOf(stepsOfVersions(adopted.map(({ migration }) => migration.version))))
  return [record, adoptionSql(names, adopted), ...rest].join('\n\n')
}

// The versions a store without any record has the tables of, as its adoption records them; none for a new store.
const adoptedVersions = async (db: ReturnType<typeof plainStoreDb>, names: StoreNames) =>
  (await storeHasTables(db, names)) ? (await planAdoption(db, names)).adopted.map(({ migration }) => migration.version) : []

/**
 * The modules the config turns off whose steps the store has, each at its last step, which a project's first snapshot
 * keeps: the store has their tables. Read from `auth_steps`, or for a store without any record, from the versions its
 * adoption finds it has; a store that records versions instead is refused.
 */
export const keptStoreModules = async (auth: AdminAuth) => {
  const names = storeNames(auth)
  const db = plainStoreDb(auth)
  const steps = await appliedSteps(db, names)
  if (steps === undefined) await refuseVersionRecord(db, names)
  const applied = steps ?? stepsOfVersions(await adoptedVersions(db, names))
  const recorded = recordedSteps(applied)
  return allModules.filter((module) => !names.names.modules.includes(module) && recorded[module] !== undefined).map((module) => keptModule(names, module, recorded[module]!))
}
