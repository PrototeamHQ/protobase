import { createHash } from 'node:crypto'
import { HttpProblem, objectKey, type FileStore } from '@protobase/server'
import type { Download } from './storage-download'
import type { SourceObject } from './storage-objects'
import { copyFault } from './storage-verify'

/** What the copy of one object came to: copied, or failed for the reason given. */
export type CopyOutcome = { object: SourceObject; fault: string | undefined }

// Passes the bytes through, counting them and taking their MD5.
const measured = () => {
  const hash = createHash('md5')
  let size = 0
  const stream = new TransformStream<Uint8Array, Uint8Array>({
    transform: (chunk, controller) => {
      size += chunk.length
      hash.update(chunk)
      controller.enqueue(chunk)
    },
  })
  return { stream, result: () => ({ size, md5: hash.digest('hex') }) }
}

// Streams the object from Supabase into the store, then checks it; a copy that is not the object's is deleted again.
const copyBytes = async (download: Download, store: FileStore, object: SourceObject, key: string) => {
  const response = await download(object.bucket, object.name)
  if (!response.ok || !response.body) {
    await response.body?.cancel()
    return `Supabase answered ${response.status}`
  }
  const measure = measured()
  await store.put(key, response.body.pipeThrough(measure.stream))
  const fault = copyFault(object, measure.result(), (await store.head(key))?.size)
  if (fault) await store.delete(key)
  return fault
}

/**
 * Copies one object's bytes into `store`, at the key `/api/sb/storage/v1` serves the object's row from. A download Supabase
 * refuses, a copy that does not match, or a store that is full fails this object only; anything else, such as the
 * connection failing, stops the copy, which a rerun resumes.
 */
export const copyObject = async (download: Download, store: FileStore, object: SourceObject): Promise<CopyOutcome> => {
  const key = await objectKey(object.bucket, object.name, object.version)
  const fault = await copyBytes(download, store, object, key).catch((error: unknown) => {
    if (error instanceof HttpProblem && error.status === 507) return 'the file provider is full'
    throw error
  })
  return { object, fault }
}
