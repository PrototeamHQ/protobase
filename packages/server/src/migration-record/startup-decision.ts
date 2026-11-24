import type { StoreModel } from '../better-auth/store/offline/store-model'
import { nameChanges } from '../better-auth/store/offline/name-changes'
import type { ModuleId } from '../better-auth/names/modules'
import { moduleSteps } from '../better-auth/store/steps'
import { modelHash, type RecordModel } from './record-model'
import type { RecordState } from './record-state'
import { recordTable } from './record-table'

// Whether the server starts on the database the record describes: on the model it reads, or on one ahead of it by
// additive migrations only. Anything it needs that is missing or older refuses, and so does a unique index still building.

const stepLabel = (module: ModuleId, step: number) => `step ${step} (${moduleSteps[module][step - 1]?.name ?? 'unknown'})`

/** What the runtime needs of the auth store that the database's lacks or has older, one line each. */
const authNeeds = (database: StoreModel | undefined, runtime: StoreModel) => {
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

const waysOut = (matches: string | undefined, running: string) =>
  `${matches ? `The database matches Protobase ${matches}; this is ${running}. ` : ''}Either bring the database to this version, \`protobase migrate --plan\` to see what applies and \`protobase migrate\` to apply it, or run ${matches ? `Protobase ${matches}` : 'the version the database was migrated with'}.`

/**
 * Why the server must not start on the database `state` describes, running `running` with the model `runtime`;
 * `undefined` when it starts. A runtime that reads nothing of the record, sign-in off, always starts.
 */
export const startupRefusal = (runtime: RecordModel, state: RecordState, running: string): string | undefined => {
  if (!runtime.auth) return
  const unfinished = unfinishedRefusals(state.unfinished)
  if (unfinished.length > 0) return `The database's migrations have not finished: ${unfinished.join('; ')}. Run \`protobase migrate\` to finish them, then start again.`
  const { newest } = state
  if (!newest) {
    return `The database has no migration recorded in ${recordTable}, and this version of Protobase needs the auth store. Write its migration with \`protobase migration\`, or \`protobase auth migration\` in a project without protobase.snapshot.json, see it with \`protobase migrate --plan\`, apply it with \`protobase migrate\`, then start again.`
  }
  if (newest.hash === modelHash(runtime)) return
  if (state.matched && state.notAdditiveSince.length === 0) return
  const needs = authNeeds(newest.model.auth, runtime.auth)
  if (needs.length > 0) return `The database is behind this version of Protobase: ${needs.join('; ')}. ${waysOut(newest.version, running)}`
  const ahead = state.matched ? `by migrations that are not additive: ${state.notAdditiveSince.join(', ')}` : `at ${newest.name}, and no migration records the model this version reads`
  return `The database is ahead of this version of Protobase ${ahead}. ${waysOut(newest.version, running)}`
}
