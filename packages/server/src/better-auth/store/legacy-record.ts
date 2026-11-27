import { sql, type Kysely } from 'kysely'
import { allModules } from '../names/modules-on'
import type { AppliedStep } from './step-record'
import { moduleSteps } from './steps'
import { versionRecord } from './steps/auth/006-drop-version-record'
import { latestStoreVersion } from './steps/legacy-versions'
import { partVersion } from './steps/render'
import { migrationNames } from './steps/step'
import type { StoreNames } from './store-names'

// The versions of the former single chain (`steps/legacy-versions.ts`) mapped onto the parts of the steps, as adopting
// a store an earlier Protobase made without any record finds them. A store that recorded those versions in a table of
// its own, before `auth_steps`, had them moved there by the migrations of Protobase 0.130, the release before the one
// that drops that table (`steps/auth/006-drop-version-record.ts`); one that was never migrated through it is refused.

/** Every part of every step with the version of the former chain that made it, as that chain made them, every module on. */
export const legacyParts = () =>
  allModules.flatMap((module) =>
    moduleSteps[module].flatMap((step) => [module, ...allModules.filter((target) => step.adds?.[target])].map((target) => ({ module, step: step.step, target, version: partVersion(module, step, target) }))),
  )

/** The parts the store applied, from the versions it has: every part of each version. */
export const stepsOfVersions = (versions: readonly number[]): AppliedStep[] => {
  const newer = versions.filter((version) => version > latestStoreVersion)
  if (newer.length > 0) throw new Error(`The auth store has version ${newer.join(', ')}, which this version of Protobase does not ship; upgrade Protobase`)
  return legacyParts()
    .filter((part) => versions.includes(part.version))
    .map(({ module, step, target }) => ({ module, step, target }))
}

/** The former record of versions, in the store's schema, as the store's names named it. */
export const versionRecordTable = (names: StoreNames) => migrationNames(names).former(versionRecord)

/** Why a store that records its migrations by version alone, in `table`, is refused. */
export const versionRecordRefusal = (table: string) =>
  `The auth store records its migrations by version in ${table}, without auth_steps, as a Protobase before 0.130 left it, which no step of this version of Protobase reads`

/** Refuses a store without `auth_steps` that has the former record of versions. */
export const refuseVersionRecord = async (db: Kysely<any>, names: StoreNames) => {
  const table = versionRecordTable(names)
  const [found] = (await sql<{ found: boolean }>`select to_regclass(${String(table)}) is not null as found`.execute(db)).rows
  if (found?.found) throw new Error(versionRecordRefusal(table.name))
}
