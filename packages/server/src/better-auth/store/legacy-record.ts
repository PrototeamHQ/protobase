import { sql, type Kysely } from 'kysely'
import { allModules } from '../names/modules-on'
import { ddl } from './ddl'
import { guardedBlock, stepRecordSql } from './migration-sql'
import { stepRecordTable, type AppliedStep } from './step-record'
import { moduleSteps } from './steps'
import { latestStoreVersion } from './steps/legacy-versions'
import { partVersion } from './steps/render'
import type { StoreNames } from './store-names'

// The record a store kept before `auth_steps`, `auth_migrations`: one row per version of its former single chain
// (`steps/legacy-versions.ts`), each written with every module on. It is read once, to fill `auth_steps`, and never
// written again. The fill is part of the schema change that brings `auth_steps`, a data move inside the store, not a
// path that keeps the old record working: nothing reads `auth_migrations` once `auth_steps` has it, and a later
// release drops it, as removing a table takes two deploys.

/** The table, in the store's schema, as the store's names resolve `auth_migrations`. */
export const legacyRecordTable = ({ names }: Pick<StoreNames, 'names'>) => names.table('auth_migrations')

/** Every part of every step with the version of the former chain that made it, as that chain made them, every module on. */
export const legacyParts = () =>
  allModules.flatMap((module) =>
    moduleSteps[module].flatMap((step) => [module, ...allModules.filter((target) => step.adds?.[target])].map((target) => ({ module, step: step.step, target, version: partVersion(module, step, target) }))),
  )

/** The parts the store applied, from the versions it recorded: every part of each version. */
export const stepsOfVersions = (versions: readonly number[]): AppliedStep[] => {
  const newer = versions.filter((version) => version > latestStoreVersion)
  if (newer.length > 0) throw new Error(`The auth store records version ${newer.join(', ')} in auth_migrations, which this version of Protobase does not ship; upgrade Protobase`)
  return legacyParts()
    .filter((part) => versions.includes(part.version))
    .map(({ module, step, target }) => ({ module, step, target }))
}

/** The versions the store recorded, in order; `undefined` when it has no `auth_migrations`. */
export const appliedVersions = async (db: Kysely<any>, names: StoreNames) => {
  const table = legacyRecordTable(names)
  const [found] = (await sql<{ found: boolean }>`select to_regclass(${String(table)}) is not null as found`.execute(db)).rows
  if (!found?.found) return
  const { version } = table.columns
  return (await sql<{ version: number }>`select ${version} as version from ${table} order by ${version}`.execute(db)).rows.map((row) => row.version)
}

/**
 * The statement that fills `auth_steps` from `auth_migrations`, once that table is there: every part of each version
 * it records, at the time it recorded it. A part recorded already is left as it is.
 */
export const fillFromLegacySql = (names: StoreNames) => {
  const legacy = legacyRecordTable(names)
  const steps = stepRecordTable(names)
  const { module, step, target, applied_at } = steps.columns
  const parts = legacyParts().map((part) => ddl`(${sql.lit(part.module)}, ${sql.lit(part.step)}, ${sql.lit(part.target)}, ${sql.lit(part.version)})`)
  const fill = ddl`insert into ${steps} (${module}, ${step}, ${target}, ${applied_at})
  select part.module, part.step, part.target, legacy.${legacy.columns.applied_at}
  from (values ${sql.join(parts, sql`, `)}) as part (module, step, target, version)
  join ${legacy} legacy on legacy.${legacy.columns.version} = part.version
  on conflict do nothing`
  return `-- The steps the store recorded by version in ${legacy.name}, recorded by step.\n${guardedBlock(ddl`to_regclass(${sql.lit(String(legacy))}) is not null`, [fill])}`
}

/** The record of the store's steps, made when it is missing and filled from `auth_migrations`, for a store that recorded versions. */
export const stepRecordMigration = (names: StoreNames) => [stepRecordSql(names), fillFromLegacySql(names)].join('\n\n')
