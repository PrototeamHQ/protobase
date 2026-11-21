import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReadPositionModel, ResourceModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { recordKey as keyOf } from '../../live/model-helpers'
import { keyValue } from '../create/create-values'
import { ownPositionFilter } from './conversation-reads'
import { moveReadPosition, type PositionStore, type SavedPosition } from './read-position-write'

type Props = {
  /** The page's read position, none for a conversation that keeps none. */
  position: ReadPositionModel | undefined
  /** The read position resource, as the reader's `/meta` describes it. */
  model: ResourceModel | undefined
  /** The record the conversation is of. */
  owner: ResourceModel
  recordKey: string
  me: string | undefined
}

/**
 * The reader's read position in a record's conversation. `openedAt` is the key of the newest message they had read when
 * they opened it, 0 for none, and undefined while it loads or without a read position: it stays put while the page is
 * open, so the "New messages" line does not move as they read. `readTo` moves the position to a message they read; it
 * never moves back, not even over a further move another tab stored, a move to where it is writes nothing, and moves go
 * one after another. Without a read position, `ready` holds at once and there is no `readTo`, so nothing is read or
 * written; one that could not be read is ready too.
 */
export const useReadPosition = ({ position, model, owner, recordKey, me }: Props) => {
  const client = useClient()
  const author = model?.author
  const kept = position !== undefined && author !== undefined && me !== undefined
  const [openedAt, setOpenedAt] = useState<number>()
  const [error, setError] = useState<unknown>()
  const saved = useRef<SavedPosition>(undefined)
  const writing = useRef<Promise<void>>(Promise.resolve())

  const find = useCallback(async (): Promise<SavedPosition | undefined> => {
    if (!kept) return
    const { items } = await client.list(position.resource, { filter: ownPositionFilter(position, recordKey, author, me), pageSize: 1 })
    const [found] = items
    if (!found) return
    return { key: String(keyOf(model!, found)), lastRead: Number(found[position.message] ?? 0), etag: String(found.etag) }
  }, [client, kept, position, model, recordKey, author, me])

  useEffect(() => {
    if (!kept) return
    find().then((found) => {
      saved.current = found
      setOpenedAt(found?.lastRead ?? 0)
    }, setError)
  }, [kept, find])

  // Each write goes over the version of the position it was read at, so it never lands over another tab's further move
  const store = useMemo((): PositionStore => ({
    find,
    create: async (lastRead) => {
      const made = await client.create(position!.resource, { [position!.field]: keyValue(owner, recordKey), [position!.message]: lastRead })
      return { key: String(keyOf(model!, made.record)), lastRead, etag: made.etag }
    },
    update: async (at, lastRead) => {
      const { etag } = await client.update(position!.resource, at.key, { [position!.message]: lastRead }, at.etag)
      return { key: at.key, lastRead, etag }
    },
  }), [client, position, owner, recordKey, model, find])

  const readTo = useCallback(
    (lastRead: number) => {
      writing.current = writing.current
        .then(async () => {
          saved.current = await moveReadPosition(store, saved.current, lastRead)
        })
        .catch(setError)
    },
    [store],
  )

  // A position that could not be read leaves the line out rather than the messages
  return { ready: !kept || openedAt !== undefined || error !== undefined, openedAt: kept ? openedAt : undefined, readTo: kept && openedAt !== undefined ? readTo : undefined, error }
}
