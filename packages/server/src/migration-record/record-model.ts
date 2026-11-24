import { createHash } from 'node:crypto'
import { latestSteps, storeModel, type StoreModel } from '../better-auth/store/offline/store-model'
import { storeNames, type StoreNamesSource } from '../better-auth/store/store-names'

// What the runtime reads of the database, by part: the auth store when sign-in is on. A project's snapshot holds the
// model its migrations make, and each applied migration records the model the database matches once it is applied.

export type RecordModel = { auth?: StoreModel }

/** The SHA-256 of the model as JSON, the same for the snapshot, the record and the runtime. */
export const modelHash = (model: RecordModel) => createHash('sha256').update(JSON.stringify(model)).digest('hex')

/** The model this version of Protobase reads with the app's auth: its store at every step this version ships. */
export const runtimeModel = (auth: StoreNamesSource | undefined): RecordModel => {
  if (!auth) return {}
  const names = storeNames(auth)
  return { auth: storeModel(names, latestSteps(names.names.modules)) }
}
