import { parseSize } from '@protobase/schema/internal'
import { HttpProblem } from '../problem'
import type { FileStore } from './store'
import { isFilePath } from './uri'

/** The most a provider may hold, in bytes and in files; a bucket has no quota of its own. */
export type FileLimits = { maxBytes?: number | string; maxFiles?: number }

/** How long a count of what a store holds is trusted before it is taken again. */
export const recountMs = 5 * 60_000

/** What `store` holds, in bytes and files, leaving out its own `.cleanup/` entries. */
export const storeUsage = async (store: FileStore) => {
  const files = (await store.list('')).filter((object) => isFilePath(object.path))
  return { bytes: files.reduce((sum, object) => sum + object.size, 0), files: files.length }
}

const limitReached = () => new HttpProblem(507, 'storage-full', 'Insufficient Storage', 'The file storage is full; delete files to make room')

class LimitReached extends Error {}

const checkedFiles = (value: number) => {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`maxFiles must be a positive whole number, not ${value}`)
  return value
}

/**
 * `store` refusing a file with `507` once it would hold more than `maxBytes` or `maxFiles`. Only files count, not the
 * store's own `.cleanup/` entries, and a file that replaces one at its path takes no more room than it adds. What the store holds is counted with `list` on the first upload and again when the
 * count is older than `recountMs`, and in between follows this instance's own writes: several instances, or a delete
 * made elsewhere, can be off by what happened since the last count.
 */
export const limitedFileStore = (store: FileStore, limits: FileLimits, now = Date.now): FileStore => {
  if (limits.maxBytes === undefined && limits.maxFiles === undefined) return store
  const maxBytes = limits.maxBytes === undefined ? Infinity : parseSize(limits.maxBytes)
  const maxFiles = limits.maxFiles === undefined ? Infinity : checkedFiles(limits.maxFiles)
  let counted: { bytes: number; files: number; at: number } | undefined
  // Uploads still streaming, so two at once cannot both take the last free bytes.
  const pending = { bytes: 0, files: 0 }

  const usage = async () => {
    if (counted && now() - counted.at < recountMs) return counted
    counted = { ...(await storeUsage(store)), at: now() }
    return counted
  }

  const put = async (path: string, body: ReadableStream<Uint8Array>) => {
    if (!isFilePath(path)) return store.put(path, body)
    // The limits hold per writer, with no atomicity across writers, as for a new file before: the store has no
    // compare-and-put, and two writers putting the same path at once are off by at most that one file. A run's trace
    // writes one part at a time, since the runner awaits each write.
    const replaced = await store.head(path)
    const added = replaced ? 0 : 1
    const freed = replaced?.size ?? 0
    const stored = await usage()
    if (stored.files + pending.files + added > maxFiles) {
      await body.cancel()
      throw limitReached()
    }
    // A replacement holds back only what it grows past the file it replaces, so replacements at once each count once.
    let size = 0
    let reserved = 0
    const counting = new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => {
        size += chunk.length
        const growth = Math.max(0, size - freed)
        pending.bytes += growth - reserved
        reserved = growth
        if (stored.bytes + pending.bytes > maxBytes) throw new LimitReached()
        controller.enqueue(chunk)
      },
    })
    pending.files += added
    try {
      const written = await store.put(path, body.pipeThrough(counting))
      if (counted) {
        counted.bytes += written.size - freed
        counted.files += added
      }
      return written
    } catch (error) {
      if (error instanceof LimitReached) throw limitReached()
      throw error
    } finally {
      pending.files -= added
      pending.bytes -= reserved
    }
  }

  const remove = async (path: string) => {
    await store.delete(path)
    // Counted again on the next upload: the delete's size is unknown here, and cleanup runs delete in batches.
    if (isFilePath(path)) counted = undefined
  }

  return { ...store, put, delete: remove }
}
