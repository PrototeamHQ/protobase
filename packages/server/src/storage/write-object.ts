import type { Db } from '@protobase/query'
import type { Caller } from '../api-keys/resolve-caller'
import { objectKey } from './object-key'
import { findObject, insertObject, updateObject, type ObjectMetadata, type ObjectWrite } from './object-sql'
import { accessDenied, alreadyExists } from './storage-error'
import { asApp, becomeCaller, type StorageDeps } from './storage-db'

/**
 * Where an upload, copy or move goes, as whom, who owns it, and whether it may replace an object already there. The
 * owner is the caller's user (`ownerOf`), except for an upload to a signed URL, which the app writes for its signer.
 */
export type WriteTarget = { bucket: string; name: string; caller: Caller; owner: string | null; upsert: boolean }

/** The owner Supabase records for a write: the signed-in user, or nobody for the keys alone. */
export const ownerOf = (caller: Caller) => (caller.role === 'authenticated' && typeof caller.claims.sub === 'string' ? caller.claims.sub : null)

// Writes the row in `trx`: the existing one is found and locked as the app, the write itself runs as the caller.
const writeRow = async (trx: Db, deps: StorageDeps, target: WriteTarget, write: ObjectWrite) => {
  const existing = await findObject(trx, target.bucket, target.name, true)
  if (existing && !target.upsert) throw alreadyExists()
  await becomeCaller(trx, deps, target.caller)
  if (!existing) return { id: await insertObject(trx, target.bucket, target.name, write), replaced: undefined }
  if (!(await updateObject(trx, existing.id, write))) throw accessDenied()
  return { id: existing.id, replaced: existing }
}

class ProbeDone extends Error {}

/**
 * Whether the caller may write the object, decided by the restored policies on a row written and rolled back, before
 * any byte is stored: a refused upload costs no storage. Throws the refusal.
 */
export const probeWrite = async (deps: StorageDeps, target: WriteTarget, type: string) => {
  const metadata: ObjectMetadata = { eTag: '', size: 0, mimetype: type, cacheControl: '', lastModified: new Date().toISOString(), contentLength: 0, httpStatusCode: 200 }
  const probe = asApp(deps, async (trx) => {
    await writeRow(trx, deps, target, { owner: target.owner, version: crypto.randomUUID(), metadata, user_metadata: null })
    throw new ProbeDone()
  })
  await probe.catch((error: unknown) => {
    if (!(error instanceof ProbeDone)) throw error
  })
}

/** The bytes of an object to write: stored at the key given, giving their size. */
export type ObjectBytes = { type: string; cacheControl: string; userMetadata: Record<string, unknown> | null; store: (key: string) => Promise<{ size: number }> }

/**
 * Writes an object: checks the caller may (`probeWrite`), stores the bytes under a new version, then writes the row
 * as the caller in one transaction, so the policies decide again on the real row. When that fails, the new bytes are
 * deleted; once it commits, the bytes of the object it replaced are.
 */
export const writeObject = async (deps: StorageDeps, target: WriteTarget, bytes: ObjectBytes) => {
  await probeWrite(deps, target, bytes.type)
  const version = crypto.randomUUID()
  const key = await objectKey(target.bucket, target.name, version)
  const { size } = await bytes.store(key)
  const metadata: ObjectMetadata = {
    eTag: `"${version}"`, size, mimetype: bytes.type, cacheControl: bytes.cacheControl, lastModified: new Date().toUTCString(), contentLength: size, httpStatusCode: 200,
  }
  const write = { owner: target.owner, version, metadata, user_metadata: bytes.userMetadata }
  const written = await asApp(deps, (trx) => writeRow(trx, deps, target, write)).catch(async (error: unknown) => {
    await deps.store.delete(key)
    throw error
  })
  if (written.replaced) await deps.store.delete(await objectKey(target.bucket, target.name, written.replaced.version))
  return { id: written.id, metadata }
}
