import type { Kysely } from 'kysely'
import { withoutAppPlugins } from '../better-auth/store/store-db'
import { readRecordState, recordHasModel } from './read-record'
import { readsNothing, type RecordModel } from './record-model'
import { startupRefusal } from './startup-decision'

// The record is read as it is named in the database, outside any organization: it holds none.
const plainDb = (db: Kysely<any>) => withoutAppPlugins(db, 'the record of migrations belongs to no organization')

/**
 * Refuses to go on, before the server serves, while the database's record of migrations does not match `runtime`, the
 * model this version reads (`runtimeModel`), as `startupRefusal` decides. It reads the record once and nothing else;
 * the server never migrates itself, and reads it without the app's query plugins. A runtime that reads nothing of the
 * record reads nothing.
 */
export const checkMigrationRecord = async (db: Kysely<any>, runtime: RecordModel, running: string) => {
  if (readsNothing(runtime)) return
  const refusal = startupRefusal(runtime, await readRecordState(plainDb(db), runtime), running)
  if (refusal) throw new Error(refusal)
}

/** Whether the database's record has a row that holds `runtime`. */
export const recordsRuntimeModel = (db: Kysely<any>, runtime: RecordModel) => recordHasModel(plainDb(db), runtime)
