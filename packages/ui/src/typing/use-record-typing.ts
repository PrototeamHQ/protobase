import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useClient } from '../data/api-provider'
import type { ConversationTyping } from './conversation-typing'
import { followRecordTyping } from './record-channel-typing'
import { createTypersStore } from './typers-store'
import { typersOn, typingSpot, type TypingPayload } from './typing'

/**
 * A conversation's typing over the record's own channel (`client.channel(resource, key)`), which admits only those who
 * may read the record (see `followRecordTyping`): joined while drawn with a record, left once not.
 */
export const useRecordTyping = (record: { resource: string; key: string } | undefined, me: string | undefined): ConversationTyping | undefined => {
  const client = useClient()
  const [store] = useState(createTypersStore)
  const followed = useRef<ReturnType<typeof followRecordTyping> | undefined>(undefined)
  const resource = record?.resource
  const key = record?.key

  useEffect(() => {
    if (resource === undefined || key === undefined) return
    const channel = client.channel(resource, key)
    const following = followRecordTyping(channel, `${resource}/${key}`, store)
    followed.current = following
    return () => {
      followed.current = undefined
      following.stop()
      channel.leave()
    }
  }, [client, store, resource, key])
  useEffect(() => () => store.stop(), [store])

  const typers = useSyncExternalStore(store.subscribe, store.typers, store.typers)
  const send = useCallback((payload: TypingPayload) => followed.current?.send(payload) ?? false, [])
  return useMemo(() => {
    if (resource === undefined || key === undefined) return
    return { typers: (thread: string | null) => typersOn(typers, typingSpot(`${resource}/${key}`, thread), me), send }
  }, [resource, key, typers, me, send])
}
