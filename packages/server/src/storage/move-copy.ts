import type { Caller } from '../api-keys/resolve-caller'
import type { FileStore } from '../files/store'
import { objectKey } from './object-key'
import { findObject, renameObject, type ObjectRow } from './object-sql'
import { accessDenied, alreadyExists, objectNotFound } from './storage-error'
import { asApp, asCaller, becomeCaller, type StorageDeps } from './storage-db'
import { ownerOf, writeObject } from './write-object'

export type ObjectAddress = { bucket: string; name: string }

/** The object as the caller may see it, else 404 `NoSuchKey`. */
export const visibleObject = async (deps: StorageDeps, caller: Caller, at: ObjectAddress) => {
  const row = await asCaller(deps, caller, true, (trx) => findObject(trx, at.bucket, at.name))
  if (!row) throw objectNotFound()
  return row
}

// Copies the bytes of `row` to `key`.
const copyBytes = async (store: FileStore, row: ObjectRow, key: string) => {
  const body = await store.read(await objectKey(row.bucket_id, row.name, row.version))
  if (!body) throw objectNotFound()
  return store.put(key, body)
}

/**
 * Copies an object the caller may see to `to`, with its type, cache control and metadata, as a new object the caller
 * must be allowed to write there (see `writeObject`); `upsert` lets it replace one.
 */
export const copyObject = async (deps: StorageDeps, caller: Caller, from: ObjectAddress, to: ObjectAddress, upsert: boolean) => {
  const source = await visibleObject(deps, caller, from)
  return writeObject(deps, { ...to, caller, owner: ownerOf(caller), upsert }, {
    type: source.metadata?.mimetype ?? 'application/octet-stream',
    cacheControl: source.metadata?.cacheControl ?? 'max-age=3600',
    userMetadata: source.user_metadata,
    store: (key) => copyBytes(deps.store, source, key),
  })
}

/**
 * Moves an object the caller may see to `to`: its bytes are copied under a new version, then its row is renamed as the
 * caller, so the update policies decide on the old and the new name. When that fails, the copy is deleted; once it
 * commits, the old bytes are.
 */
export const moveObject = async (deps: StorageDeps, caller: Caller, from: ObjectAddress, to: ObjectAddress) => {
  const source = await visibleObject(deps, caller, from)
  const version = crypto.randomUUID()
  const key = await objectKey(to.bucket, to.name, version)
  await copyBytes(deps.store, source, key)
  const moved = asApp(deps, async (trx) => {
    if (!(await findObject(trx, from.bucket, from.name, true))) throw objectNotFound()
    if (await findObject(trx, to.bucket, to.name, true)) throw alreadyExists()
    await becomeCaller(trx, deps, caller)
    if (!(await renameObject(trx, from, { ...to, version, owner: ownerOf(caller) }))) throw accessDenied()
  })
  await moved.catch(async (error: unknown) => {
    await deps.store.delete(key)
    throw error
  })
  await deps.store.delete(await objectKey(source.bucket_id, source.name, source.version))
  return source.id
}
