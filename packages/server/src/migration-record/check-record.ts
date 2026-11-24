import { plainStoreDb } from '../better-auth/store/store-db'
import type { AdminAuth } from '../better-auth/create-auth'
import { modelHash, runtimeModel } from './record-model'
import { recordHasModel, readRecordState } from './read-record'
import { startupRefusal } from './startup-decision'

/**
 * Refuses to go on, before the server serves, while the database's record of migrations does not match what this
 * version reads (`startupRefusal`). It reads the record once and nothing else; the server never migrates itself.
 * Without sign-in it reads nothing, as the runtime reads nothing of the record then.
 */
export const checkMigrationRecord = async (auth: AdminAuth | undefined, running: string) => {
  if (!auth) return
  const runtime = runtimeModel(auth)
  const refusal = startupRefusal(runtime, await readRecordState(plainStoreDb(auth), modelHash(runtime)), running)
  if (refusal) throw new Error(refusal)
}

/** Whether the database's record has a migration of the model this version reads with `auth`. */
export const recordsRuntimeModel = (auth: AdminAuth) => recordHasModel(plainStoreDb(auth), modelHash(runtimeModel(auth)))
