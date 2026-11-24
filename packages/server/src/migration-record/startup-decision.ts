import type { StoreModel } from '../better-auth/store/offline/store-model'
import { nameChanges } from '../better-auth/store/offline/name-changes'
import type { ModuleId } from '../better-auth/names/modules'
import { moduleSteps } from '../better-auth/store/steps'
import { moduleNeeds } from './module-needs'
import { readsNothing, type RecordModel } from './record-model'
import type { RecordState } from './record-state'
import { recordTable } from './record-table'
import { schemaModules } from '../schema-modules/modules'

// Whether the server starts on the database the record describes: on the model it reads, or on one ahead of it by
// additive migrations only. Anything it needs that is missing or older refuses, and so does a unique index still building.

const stepLabel = (module: ModuleId, step: number) => `step ${step} (${moduleSteps[module][step - 1]?.name ?? 'unknown'})`

/** What the runtime needs of the auth store that the database's lacks or has older, one line each. */
const authNeeds = (database: StoreModel | undefined, runtime: StoreModel | undefined) => {
  if (!runtime) return []
  if (!database) return ['the auth store is not recorded']
  const steps = (Object.entries(runtime.modules) as [ModuleId, StoreModel['modules'][ModuleId]][]).flatMap(([module, entry]) => {
    const had = database.modules[module]?.lastStep
    const needed = entry!.lastStep
    if (had === undefined) return [`the auth store lacks the ${module} module, which this version needs at ${stepLabel(module, needed)}`]
    return had < needed ? [`the auth store's ${module} module is at ${stepLabel(module, had)}, and this version needs ${stepLabel(module, needed)}`] : []
  })
  return [...steps, ...nameChanges(database, runtime, 'the database').map((change) => `the auth store's ${change}`)]
}

/** The unfinished migrations that keep the server from starting: a unique index, or an `.after.sql` of unknown shape. */
const unfinishedRefusals = (unfinished: RecordState['unfinished']) =>
  unfinished.flatMap(({ name, after }) => {
    if (after === null) return [`${name} has not finished its .after.sql, whose indexes are not recorded`]
    return after.filter(({ unique }) => unique).map(({ index }) => `${name} has not finished building the unique index ${index}`)
  })

const waysOut = (matches: string, running: string) =>
  `To bring the database up to ${running}, run \`protobase migrate --plan\` to see the migrations it will apply, then \`protobase migrate\`. Or run Protobase ${matches}, the version the database matches.`

// What the runtime reads, as the refusal of a database without a record names it, and the commands that write it.
const neededParts = (runtime: RecordModel) => {
  const modules = Object.keys(runtime.modules ?? {}) as (keyof NonNullable<RecordModel['modules']>)[]
  const parts = [...(runtime.auth ? ['the auth store'] : []), ...modules.map((id) => schemaModules[id].label)]
  const already = [
    ...(runtime.auth ? ['with `protobase auth migration` for a store whose tables are there already'] : []),
    ...(modules.length > 0 ? ['with `protobase migration baseline` for a schema a migration of an earlier version made'] : []),
  ]
  return `this version of Protobase needs ${parts.join(' and ')}. Write the migration that makes and records ${parts.length > 1 ? 'them' : 'it'} with \`protobase migration\`, or ${already.join(', or ')}`
}

/**
 * Why the server must not start on the database `state` describes, running `running` with the model `runtime`;
 * `undefined` when it starts. Each part the runtime reads is compared on its own, and a part of the record it does
 * not read, such as a module another version needs, does not count. A runtime that reads nothing of the record, sign-in
 * off and no schema module needed, always starts.
 */
export const startupRefusal = (runtime: RecordModel, state: RecordState, running: string): string | undefined => {
  if (readsNothing(runtime)) return
  const unfinished = unfinishedRefusals(state.unfinished)
  if (unfinished.length > 0) return `The database's migrations have not finished, so the server will not start: ${unfinished.join('; ')}. Run \`protobase migrate\` to finish them.`
  const { newest } = state
  if (!newest) return `The database has no migration recorded in ${recordTable}, so the server will not start: ${neededParts(runtime)}, run \`protobase migrate --plan\` to see it, then \`protobase migrate\`.`
  if (state.matched && state.notAdditiveSince.length === 0) return
  const needs = [...authNeeds(newest.model.auth, runtime.auth), ...moduleNeeds(newest.model.modules, runtime.modules ?? {})]
  if (needs.length > 0) return `The database is behind Protobase ${running}, so the server will not start: ${needs.join('; ')}. ${waysOut(newest.version, running)}`
  if (state.matched) {
    return `The database is ahead of Protobase ${running}, so the server will not start: it has migrations that break older code since the one this version reads: ${state.notAdditiveSince.join(', ')}. Rolling back to this version is blocked once they are applied: run Protobase ${newest.version}, the version the database matches, or a later one.`
  }
  return `The database is ahead of Protobase ${running}, so the server will not start: its newest migration, ${newest.name}, records a model no migration of this version's records. ${waysOut(newest.version, running)}`
}
