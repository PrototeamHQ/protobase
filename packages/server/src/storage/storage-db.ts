import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { callerSettings } from '../api-keys/caller-settings'
import type { Caller } from '../api-keys/resolve-caller'
import type { Signer } from '../files/signer'
import type { FileStore } from '../files/store'
import { readTransaction, writeTransaction } from '../transactions'

/** What `/api/sb/storage/v1` needs: the database, the store of the provider that keeps the bytes, and the files signer. */
export type StorageDeps = {
  db: Db
  statementTimeoutMs: number
  actorSetting?: string
  store: FileStore
  signer: Signer
  /** The largest object any bucket takes, in bytes. */
  maxBytes: number
}

/**
 * Makes the rest of the transaction run as `caller`: its role and claims, as `/api/sb/rest/v1` sets them (see
 * `callerSettings`), so the restored `storage.objects` and `storage.buckets` policies decide what it reads and writes.
 * What runs before it runs as the app's own role, which owns the tables.
 */
export const becomeCaller = async (trx: Db, deps: Pick<StorageDeps, 'actorSetting'>, caller: Caller) => {
  const settings = Object.entries(callerSettings(caller, deps.actorSetting))
  await sql`select ${sql.join(settings.map(([name, value]) => sql`set_config(${name}, ${value}, true)`))}`.execute(trx)
}

/** Runs `work` in one transaction as `caller`, read-only when `readOnly`. */
export const asCaller = <T>(deps: Omit<StorageDeps, 'store' | 'signer' | 'maxBytes'>, caller: Caller, readOnly: boolean, work: (trx: Db) => Promise<T>) => {
  const settings = callerSettings(caller, deps.actorSetting)
  if (readOnly) return readTransaction(deps.db, deps.statementTimeoutMs, work, settings)
  return writeTransaction(deps.db, deps.statementTimeoutMs, work, settings)
}

/** Runs `work` in one transaction as the app's own role, for what no caller decides: public objects, signed URLs. */
export const asApp = <T>(deps: Pick<StorageDeps, 'db' | 'statementTimeoutMs'>, work: (trx: Db) => Promise<T>) => writeTransaction(deps.db, deps.statementTimeoutMs, work)
