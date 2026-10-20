import { accepts } from '../files/media-types'
import { findBucket } from './bucket-sql'
import { incomingObject } from './object-body'
import { bucketNotFound, mimeTypeRefused } from './storage-error'
import { asApp, type StorageDeps } from './storage-db'
import { writeObject, type WriteTarget } from './write-object'

/** The bucket an upload goes to, read as the app, as Supabase Storage reads it: its size limit and allowed types. */
export const uploadBucket = async (deps: StorageDeps, id: string) => {
  const bucket = await asApp(deps, (trx) => findBucket(trx, id))
  if (!bucket) throw bucketNotFound()
  return bucket
}

/**
 * Stores the object a request uploads at `target` (see `writeObject`), within the bucket's size limit and the app's,
 * and of a type the bucket allows. Answers what storage-js reads back: the row's id and `<bucket>/<name>`.
 */
export const uploadObject = async (deps: StorageDeps, request: Request, target: WriteTarget) => {
  const bucket = await uploadBucket(deps, target.bucket)
  const maxBytes = Math.min(bucket.file_size_limit ?? Infinity, deps.maxBytes)
  const incoming = await incomingObject(request, maxBytes)
  const type = incoming.type.split(';', 1)[0]!.trim().toLowerCase()
  if (bucket.allowed_mime_types?.length && !accepts(bucket.allowed_mime_types, type)) {
    await incoming.body.cancel()
    throw mimeTypeRefused(type)
  }
  const { id } = await writeObject(deps, target, { ...incoming, store: (key) => deps.store.put(key, incoming.body) })
  return { Id: id, Key: `${target.bucket}/${target.name}` }
}
