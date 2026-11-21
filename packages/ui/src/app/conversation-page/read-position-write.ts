import { isApiError } from '@protobase/client'

/** The reader's stored position: its record's key, the key of the message they read to, and the version it was read at. */
export type SavedPosition = { key: string; lastRead: number; etag: string }

/** How the position is read and written: `update` writes only over the version `at` holds, else rejects with a 412. */
export type PositionStore = {
  find: () => Promise<SavedPosition | undefined>
  create: (lastRead: number) => Promise<SavedPosition>
  update: (at: SavedPosition, lastRead: number) => Promise<SavedPosition>
}

// After another tab's write, the position it stored, which this one compares against once
const stored = async (store: PositionStore, failed: unknown) => {
  const found = await store.find()
  if (!found) throw failed
  return found
}

const raise = (store: PositionStore, at: SavedPosition, lastRead: number) => (at.lastRead >= lastRead ? at : store.update(at, lastRead))

/**
 * Moves the reader's position up to `lastRead` from `saved`, what this tab last stored, and answers what is stored
 * after. It never moves down: each write goes over the version it compared against, so when another tab wrote since,
 * the write is refused, and the position that tab stored is compared again and kept when it is as far or further. A
 * create another tab beat to it, refused as taken, goes the same way.
 */
export const moveReadPosition = async (store: PositionStore, saved: SavedPosition | undefined, lastRead: number): Promise<SavedPosition> => {
  if (saved && saved.lastRead >= lastRead) return saved
  const write = saved ? store.update(saved, lastRead) : store.create(lastRead)
  const status = saved ? 412 : 409
  return write.catch(async (failed: unknown) => {
    if (!isApiError(failed) || failed.status !== status) throw failed
    return raise(store, await stored(store, failed), lastRead)
  })
}
