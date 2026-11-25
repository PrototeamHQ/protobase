import { createHash } from 'node:crypto'
import { latestSteps, storeModel, type StoreModel } from '../better-auth/store/offline/store-model'
import { storeNames, type StoreNamesSource } from '../better-auth/store/store-names'
import { latestModules, targetIds, type ModuleTargets, type ModulesModel } from '../schema-modules/modules'

// What the runtime reads of the database, by part: the auth store when sign-in is on, and each schema module the app
// needs (`neededModules`). A project's snapshot holds the model its migrations make, and each applied migration records
// the model the database matches once it is applied.
export type RecordModel = { auth?: StoreModel; modules?: ModulesModel }

/** The SHA-256 of the model as JSON, the same for the snapshot, the record and the runtime. */
export const modelHash = (model: RecordModel) => createHash('sha256').update(JSON.stringify(model)).digest('hex')

/**
 * The model this version of Protobase reads with the app's auth and the schema modules it needs: the store and each
 * module at every step and replaceable this version ships, with the names and resources the app gives it.
 */
export const runtimeModel = (auth: StoreNamesSource | undefined, modules: ModuleTargets): RecordModel => {
  const names = auth && storeNames(auth)
  return {
    ...(names && { auth: storeModel(names, latestSteps(names.names.modules)) }),
    ...(targetIds(modules).length > 0 && { modules: latestModules(modules) }),
  }
}

/** Whether the runtime reads nothing of the record: sign-in off and no schema module needed. */
export const readsNothing = (model: RecordModel) => !model.auth && !model.modules
