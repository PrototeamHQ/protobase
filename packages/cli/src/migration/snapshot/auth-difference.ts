import { keepSql, latestSteps, nameChanges, resolveNames, offlineStepsMigration, revivalCheckSql, storeModel, type LastSteps, type ModuleId, type OffChoice, type SnapshotStore, type StoreModel } from '@protobase/server/internal'
import type { AuthTarget } from './auth-target'
import { keptAfter, moduleChanges } from './module-changes'
import { modelHash, snapshotFile, type Snapshot } from './snapshot-file'

/** Each module's last step in a model. */
export const lastStepsOf = (model: StoreModel): LastSteps => Object.fromEntries(Object.entries(model.modules).map(([module, entry]) => [module, entry!.lastStep]))

// The model without the modules the config turns off, which `moduleChanges` names.
const stillOn = (model: StoreModel, target: AuthTarget): StoreModel => ({
  ...model,
  modules: Object.fromEntries(Object.entries(model.modules).filter(([module]) => target.names.names.modules.includes(module as ModuleId))),
})

// The snapshot's model with the modules it kept that the config turns on again, under the names they were kept with.
const withRevived = (snapshot: Snapshot, before: StoreModel, target: AuthTarget): StoreModel => {
  const revived = snapshot.decisions.modules.kept.filter(({ module }) => target.names.names.modules.includes(module))
  return { ...before, modules: { ...before.modules, ...Object.fromEntries(revived.map(({ module, step, tables }) => [module, { lastStep: step, tables }])) } }
}

// The config's model with the snapshot's modules still on too, so the columns a module turned off added to the tables
// of those still on keep their names to compare, and a kept module turned on again at the step it was kept at.
const widerModel = (snapshot: Snapshot, before: StoreModel, target: AuthTarget) => {
  const modules = [...new Set([...(Object.keys(before.modules) as ModuleId[]), ...target.names.names.modules])]
  const names = resolveNames({ ...target.names.names.input, modules })
  return stillOn(storeModel({ ...target.names, names }, snapshotStore(snapshot)!.lastSteps), target)
}

/**
 * What the config asks of the auth store that Protobase's steps cannot write, one line each: sign-in turned off while
 * the snapshot has the store, or a name or type the store has changed of a module that stays on or of a kept one
 * turned on again. None when the steps can bring it there.
 */
export const authRefusals = (snapshot: Snapshot | undefined, target: AuthTarget | undefined) => {
  const before = snapshot?.model.auth
  if (!before) return []
  if (!target) return [`sign-in is off while ${snapshotFile} has the auth store, and turning it off is not supported yet`]
  return nameChanges(stillOn(withRevived(snapshot, before, target), target), widerModel(snapshot, before, target)).map((change) => `the auth store's ${change}`)
}

/**
 * What the config lacks of organizations, one line each: the default organization, once they are on or were ever on,
 * which stands in for every one while they are off; and the role of the users there already, as they turn on for the
 * first time over a store that may hold users, which each becomes a member of the default organization with.
 */
export const organizationRefusals = (snapshot: Snapshot | undefined, target: AuthTarget) => {
  const everOn = snapshot?.decisions.organizations.everOn ?? false
  if (!target.organizationsOn && !everOn) return []
  if (!target.organizations) return [`organizations.default is not set, and organizations ${target.organizationsOn ? 'are on' : 'were on'}: give the config the organization that stands in while they are off, such as default: { id: 'main', name: 'Main', slug: 'main' }`]
  const store = snapshotStore(snapshot)
  const firstOn = target.organizationsOn && store?.lastSteps.organizations === undefined
  // A new store with its own user table holds no users yet.
  const usersThere = store !== undefined || target.names.users.keyTable !== undefined || externalUser(snapshot, target)
  if (firstOn && usersThere && target.organizations.existingUsersRole === undefined) return ['organizations.existingUsersRole is not set, and organizations turn on: name the app role every user there already holds in the default organization']
  return []
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
export const stepsAfter = (snapshot: Snapshot | undefined, target: AuthTarget) => offlineStepsMigration(target.names, snapshotStore(snapshot), target.organizations, externalUser(snapshot, target))

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
  const unset = target ? organizationRefusals(snapshot, target) : []
  if (unset.length > 0) throw new Error(unset.join('; '))
  const changes = moduleChanges(snapshot, target)
  const kept = keptAfter(snapshot?.decisions.modules.kept ?? [], changes)
  if (!target) return { model: undefined, migration: undefined, changes, kept }
  if (changes.off.length > 0 && off === undefined) throw new Error(`${changes.off.map(({ module }) => module).join(', ')} is off in the config while ${snapshotFile} has its tables. ${offHint}.`)
  if (changes.off.length > 0 && off !== 'keep') throw new Error(`--off ${off} is not available yet: a module turned off keeps its tables and rows (--off keep)`)
  const before = snapshot?.model.auth
  const steps = stepsAfter(snapshot, target)
  const parts = [
    ...changes.off.map(({ module }) => keepSql(target.names, module, Object.keys(before?.modules ?? {}) as ModuleId[], externalUser(snapshot, target) || target.names.users.keyTable !== undefined)),
    ...changes.revived.map(({ module, step }) => revivalCheckSql(target.names, module, step)),
    ...(steps ? [steps.sql] : []),
  ]
  const model = storeModel(target.names, steps || !before ? latestSteps(target.names.names.modules) : snapshotStore(snapshot)!.lastSteps)
  // A store this version describes otherwise, such as a table whose rows now belong to an organization, is recorded anew.
  if (parts.length === 0 && redescribed(before, model)) parts.push(redescribedSql)
  const migration = parts.length === 0 ? undefined : { sql: parts.join('\n\n'), checks: steps?.checks ?? [], ...(steps?.after && { after: steps.after }) }
  return { migration, model, changes, kept }
}

/** Whether this version of Protobase describes the snapshot's store otherwise than the snapshot does, with no step to apply. */
export const redescribed = (before: StoreModel | undefined, model: StoreModel) => before !== undefined && modelHash({ auth: before }) !== modelHash({ auth: model })

/** The migration that records the store as this version describes it, changing nothing in the database. */
export const redescribedSql = '-- The auth store as this version of Protobase describes it, such as which tables hold the rows of an organization; nothing in the database changes.'
