import { sql, type Kysely } from 'kysely'
import { builtInModules, type ModuleId } from '../names/modules'
import { ddl } from './ddl'
import { moduleSteps } from './steps'
import type { Had, RenderedStep } from './steps/render'
import type { StoreNames } from './store-names'

// The record of the store's steps, `auth_steps`: one row per part of a step applied, its module, its number and the
// module whose tables its statements change, `target`, which is its own module or, for the columns one module adds to
// another's tables, that other one. A part applied while its target was off has no row, so it is applied once the
// target is on.

/** A part of a step the store applied. */
export type AppliedStep = { module: ModuleId; step: number; target: ModuleId }

/** `Had` over a list of applied parts. */
export const hadOf =
  (applied: readonly AppliedStep[]): Had =>
  (module, step, target) =>
    applied.some((part) => part.module === module && part.step === step && part.target === target)

/** The table, in the store's schema, as the store's names resolve `auth_steps`. */
export const stepRecordTable = ({ names }: Pick<StoreNames, 'names'>) => names.table('auth_steps')

/** The statement that makes the table when it is missing. */
export const createStepRecord = (names: StoreNames) => {
  const table = stepRecordTable(names)
  const { module, step, target, applied_at } = table.columns
  return ddl`create table if not exists ${table} (
  ${module} text not null,
  ${step} integer not null,
  ${target} text not null,
  ${applied_at} timestamptz,
  primary key (${module}, ${step}, ${target})
)`
}

/** The part a rendered step is. */
export const partOf = (part: RenderedStep): AppliedStep => ({ module: part.module, step: part.step.step, target: part.on ?? part.module })

/** The statement that records `parts` as applied, now. */
export const recordSteps = (names: StoreNames, parts: readonly AppliedStep[]) => {
  const table = stepRecordTable(names)
  const { module, step, target, applied_at } = table.columns
  const rows = parts.map((part) => ddl`(${sql.lit(part.module)}, ${sql.lit(part.step)}, ${sql.lit(part.target)}, now())`)
  return ddl`insert into ${table} (${module}, ${step}, ${target}, ${applied_at}) values ${sql.join(rows, sql`, `)}`
}

/** The condition that holds once `part` is recorded. */
export const stepRecorded = (names: StoreNames, part: RenderedStep) => {
  const table = stepRecordTable(names)
  const { module, step, target } = table.columns
  const key = partOf(part)
  return ddl`exists (select from ${table} where ${module} = ${sql.lit(key.module)} and ${step} = ${sql.lit(key.step)} and ${target} = ${sql.lit(key.target)})`
}

const known = (part: { module: string; step: number; target: string }) =>
  builtInModules.some(({ id }) => id === part.module) && builtInModules.some(({ id }) => id === part.target) && moduleSteps[part.module as ModuleId].some(({ step }) => step === part.step)

/** Refuses a recorded part of a step this version does not ship, such as one a newer Protobase applied. */
export const refuseUnshipped = (rows: readonly { module: string; step: number; target: string }[]) => {
  const unknown = rows.filter((row) => !known(row))
  if (unknown.length > 0) {
    throw new Error(`The auth store records ${unknown.map((row) => `step ${row.step} of ${row.module}`).join(', ')}, which this version of Protobase does not ship; upgrade Protobase`)
  }
}

/** The parts the store recorded; `undefined` when it has no `auth_steps`. Refuses a step this version does not ship. */
export const appliedSteps = async (db: Kysely<any>, names: StoreNames): Promise<AppliedStep[] | undefined> => {
  const table = stepRecordTable(names)
  const [found] = (await sql<{ found: boolean }>`select to_regclass(${String(table)}) is not null as found`.execute(db)).rows
  if (!found?.found) return
  const { module, step, target } = table.columns
  const { rows } = await sql<{ module: string; step: number; target: string }>`select ${module} as module, ${step} as step, ${target} as target from ${table} order by 1, 2, 3`.execute(db)
  refuseUnshipped(rows)
  return rows as AppliedStep[]
}
