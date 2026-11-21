import { useEffect, useState } from 'react'
import type { ConversationPageModel } from '@protobase/schema'
import { useClient } from '../data/api-provider'
import { useAdminMeta } from '../app/meta-gate'
import { countUnread } from './count-unread'
import { useRelay } from './relay-context'
import { conversationKey, countNotice, opened, type UnreadCounts } from './unread'

/**
 * The unread messages of the conversations `keys` of `resource`, by key: counted as they first show and after the relay
 * reconnects, then one more for each new message its notices tell of without reading anything, and none for the one
 * the reader opens. Undefined while it counts first, without the relay, and after a count failed, which it reports.
 */
export const useUnreadCounts = (resource: string, page: ConversationPageModel | undefined, keys: readonly string[]) => {
  const context = useRelay()
  const client = useClient()
  const { resources } = useAdminMeta()
  const [counts, setCounts] = useState<UnreadCounts>()
  const listed = keys.join('\n')

  useEffect(() => {
    if (!context || !page) return
    const { store, me } = context
    const source = { conversations: resource, messages: page.resource }
    let current = true
    const count = () => {
      countUnread(client, resources, page, listed === '' ? [] : listed.split('\n'), me).then(
        (fresh) => {
          if (!current) return
          // The one open shows everything, so nothing in it is unread.
          setCounts(Object.fromEntries(Object.entries(fresh).map(([key, value]) => [key, store.viewing(`${resource}/${key}`) ? 0 : value])))
        },
        (error: unknown) => {
          if (!current) return
          setCounts(undefined)
          reportError(error)
        },
      )
    }
    count()
    const stops = [
      store.onNotice((notice) => setCounts((now) => now && countNotice(now, notice, source, store.viewing, store.own()))),
      store.onResync(count),
      store.onView((channel) => {
        const key = conversationKey(channel, resource)
        if (key !== undefined) setCounts((now) => now && opened(now, key))
      }),
    ]
    return () => {
      current = false
      for (const stop of stops) stop()
    }
  }, [context, client, resources, resource, page, listed])

  return context && page ? counts : undefined
}
