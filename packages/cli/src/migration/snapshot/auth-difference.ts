import { latestSteps, nameChanges, offlineStepsMigration, storeModel, type LastSteps, type StoreModel } from '@protobase/server/internal'
import type { AuthTarget } from './auth-target'
import { snapshotFile, type Snapshot } from './snapshot-file'

/** Each module's last step in a model. */
export const lastStepsOf = (model: StoreModel): LastSteps => Object.fromEntries(Object.entries(model.modules).map(([module, entry]) => [module, entry!.lastStep]))

/**
 * What the config asks of the auth store that Protobase's steps cannot write, one line each: sign-in turned off while
 * the snapshot has the store, or a name or type the store has changed. None when the steps can bring it there.
 */
export const authRefusals = (snapshot: Snapshot | undefined, target: AuthTarget | undefined) => {
  const before = snapshot?.model.auth
  if (!before) return []
  if (!target) return [`sign-in is off while ${snapshotFile} has the auth store, and turning it off is not supported yet`]
  return nameChanges(before, storeModel(target.names, lastStepsOf(before))).map((change) => `the auth store's ${change}`)
}

/** How to write what the steps cannot, once refused. */
export const customHint = 'Write the change by hand with `protobase migration --custom <name> --record-config`.'

/**
 * The difference between the snapshot's auth store and the config's, from the snapshot alone: the steps after each
 * module's last one (`migration`, undefined when there are none), and the store's model once they are applied.
 */
export const authDifference = (snapshot: Snapshot | undefined, target: AuthTarget | undefined) => {
  const refusals = authRefusals(snapshot, target)
  if (refusals.length > 0) throw new Error(`${refusals.join('; ')}. ${customHint}`)
  if (!target) return { model: undefined, migration: undefined }
  const before = snapshot?.model.auth
  const migration = offlineStepsMigration(target.names, before && lastStepsOf(before))
  return { migration, model: storeModel(target.names, migration || !before ? latestSteps(target.names.names.modules) : lastStepsOf(before)) }
}
