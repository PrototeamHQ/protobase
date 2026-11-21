import { useCallback, useEffect, useRef, useState } from 'react'
import { isApiError } from '@protobase/client'
import type { ReadPositionModel, ResourceModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { recordKey as keyOf } from '../../live/model-helpers'
import { keyValue } from '../create/create-values'
import { ownPositionFilter } from './conversation-reads'

type Saved = { key: string; lastRead: number }

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
 * never moves back, a move to where it is writes nothing, and moves go one after another. Without a read position,
 * `ready` holds at once and there is no `readTo`, so nothing is read or written; one that could not be read is ready too.
 */
export const useReadPosition = ({ position, model, owner, recordKey, me }: Props) => {
  const client = useClient()
  const author = model?.author
  const kept = position !== undefined && author !== undefined && me !== undefined
  const [openedAt, setOpenedAt] = useState<number>()
  const [error, setError] = useState<unknown>()
  const saved = useRef<Saved>(undefined)
  const writing = useRef<Promise<void>>(Promise.resolve())

  const find = useCallback(async (): Promise<Saved | undefined> => {
    if (!kept) return
    const { items } = await client.list(position.resource, { filter: ownPositionFilter(position, recordKey, author, me), pageSize: 1 })
    const [found] = items
    if (!found) return
    return { key: String(keyOf(model!, found)), lastRead: Number(found[position.message] ?? 0) }
  }, [client, kept, position, model, recordKey, author, me])

  useEffect(() => {
    if (!kept) return
    find().then((found) => {
      saved.current = found
      setOpenedAt(found?.lastRead ?? 0)
    }, setError)
  }, [kept, find])

  const update = useCallback(
    async (at: Saved, lastRead: number) => {
      await client.update(position!.resource, at.key, { [position!.message]: lastRead }, '*')
      saved.current = { key: at.key, lastRead }
    },
    [client, position],
  )

  // A create another tab beat to it, refused as taken, is an update of the position that tab made
  const create = useCallback(
    async (lastRead: number) => {
      const made = await client.create(position!.resource, { [position!.field]: keyValue(owner, recordKey), [position!.message]: lastRead }).catch(async (failed: unknown) => {
        if (!isApiError(failed) || failed.status !== 409) throw failed
        const found = await find()
        if (!found) throw failed
        await update(found, lastRead)
        return
      })
      if (made) saved.current = { key: String(keyOf(model!, made.record)), lastRead }
    },
    [client, position, owner, recordKey, model, find, update],
  )

  const readTo = useCallback(
    (lastRead: number) => {
      writing.current = writing.current
        .then(() => {
          const at = saved.current
          if (at && at.lastRead >= lastRead) return
          return at ? update(at, lastRead) : create(lastRead)
        })
        .catch(setError)
    },
    [update, create],
  )

  // A position that could not be read leaves the line out rather than the messages
  return { ready: !kept || openedAt !== undefined || error !== undefined, openedAt: kept ? openedAt : undefined, readTo: kept && openedAt !== undefined ? readTo : undefined, error }
}
