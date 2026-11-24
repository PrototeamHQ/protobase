import { keepSql, latestSteps, nameChanges, resolveNames, offlineStepsMigration, revivalCheckSql, storeModel, type LastSteps, type ModuleId, type OffChoice, type SnapshotStore, type StoreModel } from '@protobase/server/internal'
import type { AuthTarget } from './auth-target'
import { keptAfter, moduleChanges } from './module-changes'
import { snapshotFile, type Snapshot } from './snapshot-file'

/** Each module's last step in a model. */
export const lastStepsOf = (model: StoreModel): LastSteps => Object.fromEntries(Object.entries(model.modules).map(([module, entry]) => [module, entry!.lastStep]))

// The model without the modules the config turns off, which `moduleChanges` names.
const stillOn = (model: StoreModel, target: AuthTarget): StoreModel => ({
  ...model,
  modules: Object.fromEntries(Object.entries(model.modules).filter(([module]) => target.names.names.modules.includes(module as ModuleId))),
})

// The config's model with the snapshot's modules still on too, so the columns a module turned off added to the tables
// of those still on keep their names to compare.
const widerModel = (before: StoreModel, target: AuthTarget) => {
  const modules = [...new Set([...(Object.keys(before.modules) as ModuleId[]), ...target.names.names.modules])]
  const names = resolveNames({ ...target.names.names.input, modules })
  return stillOn(storeModel({ ...target.names, names }, lastStepsOf(before)), target)
}

/**
 * What the config asks of the auth store that Protobase's steps cannot write, one line each: sign-in turned off while
 * the snapshot has the store, or a name or type the store has changed of a module that stays on. None when the steps
 * can bring it there.
 */
export const authRefusals = (snapshot: Snapshot | undefined, target: AuthTarget | undefined) => {
  const before = snapshot?.model.auth
  if (!before) return []
  if (!target) return [`sign-in is off while ${snapshotFile} has the auth store, and turning it off is not supported yet`]
  return nameChanges(stillOn(before, target), widerModel(before, target)).map((change) => `the auth store's ${change}`)
}

/**
 * The store as the snapshot has it, for the steps after its own: each module's last step, a kept one's included, so a
 * module turned on again goes on from it; `undefined` when it has none.
 */
export const snapshotStore = (snapshot: Snapshot | undefined): SnapshotStore | undefined => {
  const before = snapshot?.model.auth
  if (!before) return
  const kept = Object.fromEntries(snapshot.decisions.modules.kept.map(({ module, step }) => [module, step]))
  return { lastSteps: { ...kept, ...lastStepsOf(before) }, on: Object.keys(before.modules) as ModuleId[], stepRecord: before.modules.auth?.tables.auth_steps !== undefined }
}

// Whether the snapshot records the user table as a relation Protobase did not make, which no statement alters.
const externalUser = (snapshot: Snapshot | undefined, target: AuthTarget) => {
  const user = target.names.names.table('user')
  const userName = target.names.schema === undefined ? user.name : `${target.names.schema}.${user.name}`
  return snapshot?.decisions.external?.includes(userName) ?? false
}

/** The steps the store lacks after the snapshot's, which leave alone a user table the snapshot records as external. */
export const stepsAfter = (snapshot: Snapshot | undefined, target: AuthTarget) => offlineStepsMigration(target.names, snapshotStore(snapshot), externalUser(snapshot, target))

/** How to write what the steps cannot, once refused. */
export const customHint = 'Write the change by hand with `protobase migration --custom <name> --record-config`.'

/** The way through when a module turned off has no choice made for its tables. */
export const offHint = 'Run `protobase migration` in a terminal to choose what becomes of its tables, or pass `--off keep`'

/**
 * The difference between the snapshot's auth store and the config's, from the snapshot alone: `migration`, what keeps
 * each module turned off (`off`, the choice made for them), the check that refuses to turn a kept one on again while
 * its tables hold rows, and the steps after each module's last one, undefined when there is none of these; the
 * store's model once it is applied; and the modules kept then.
 */
export const authDifference = (snapshot: Snapshot | undefined, target: AuthTarget | undefined, off?: OffChoice) => {
  const refusals = authRefusals(snapshot, target)
  if (refusals.length > 0) throw new Error(`${refusals.join('; ')}. ${customHint}`)
  const changes = moduleChanges(snapshot, target)
  const kept = keptAfter(snapshot?.decisions.modules.kept ?? [], changes)
  if (!target) return { model: undefined, migration: undefined, changes, kept }
  if (changes.off.length > 0 && off === undefined) throw new Error(`${changes.off.map(({ module }) => module).join(', ')} is off in the config while ${snapshotFile} has its tables. ${offHint}.`)
  if (changes.off.length > 0 && off !== 'keep') throw new Error(`--off ${off} is not available yet: a module turned off keeps its tables and rows (--off keep)`)
  const before = snapshot?.model.auth
  const steps = stepsAfter(snapshot, target)
  const parts = [
    ...changes.off.map(({ module }) => keepSql(target.names, module, externalUser(snapshot, target) || target.names.users.keyTable !== undefined)),
    ...changes.revived.map(({ module, step }) => revivalCheckSql(target.names, module, step)),
    ...(steps ? [steps.sql] : []),
  ]
  const migration = parts.length === 0 ? undefined : { sql: parts.join('\n\n'), checks: steps?.checks ?? [] }
  return { migration, model: storeModel(target.names, steps || !before ? latestSteps(target.names.names.modules) : snapshotStore(snapshot)!.lastSteps), changes, kept }
}
