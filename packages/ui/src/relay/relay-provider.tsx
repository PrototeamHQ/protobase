import { useContext, useEffect, useState, type ReactNode } from 'react'
import { useOptionalAuth } from '../auth/auth-provider'
import { useClient } from '../data/api-provider'
import { useAdminMeta } from '../app/meta-gate'
import { PresenceContext } from '../presence/presence'
import { followPresence } from './follow-presence'
import { RelayContext, type RelayContextValue } from './relay-context'
import { createRelayStore } from './relay-store'

/** Whether the page is in view: `away` while it is hidden, as the relay's presence takes it. */
const presenceOfPage = () => (document.visibilityState === 'hidden' ? 'away' : 'online')

/**
 * Follows the app's realtime relay for someone signed in, when the app has one: one socket for the page, which the
 * conversation pages, the sidebar and the live updates beneath it share. It tells the relay the person is away while
 * the page is hidden, and online again once it shows, connecting again at once then if it was down. With the relay's
 * presence, it keeps who of the people the page shows is online, away or offline in the page's presence store.
 */
export const RelayProvider = ({ children }: { children: ReactNode }) => {
  const meta = useAdminMeta()
  const client = useClient()
  const auth = useOptionalAuth()
  const me = auth?.state.kind === 'signed-in' ? auth.state.user.id : undefined
  const on = Boolean(meta.relay) && me !== undefined
  const presenceFields = meta.relay?.presence
  const presence = useContext(PresenceContext)
  const [value, setValue] = useState<RelayContextValue>()

  useEffect(() => {
    if (!on) return
    const store = createRelayStore()
    const stop = client.relay.follow(store.handlers)
    // A page that shows again, or a device back online, connects at once rather than on the next try's schedule.
    const tell = () => {
      client.relay.presence(presenceOfPage())
      if (presenceOfPage() === 'online') client.relay.reconnect()
    }
    const online = () => client.relay.reconnect()
    tell()
    document.addEventListener('visibilitychange', tell)
    window.addEventListener('online', online)
    setValue({ relay: client.relay, store, me: me! })
    return () => {
      document.removeEventListener('visibilitychange', tell)
      window.removeEventListener('online', online)
      stop()
      store.stop()
      setValue(undefined)
    }
  }, [client, on, me])

  // Its own effect, so a fresh `/meta` follows presence anew without connecting the socket again.
  useEffect(() => {
    if (!value || !presenceFields || !presence) return
    return followPresence(client, presenceFields, presence, value.store)
  }, [client, value, presenceFields, presence])

  return <RelayContext.Provider value={value}>{children}</RelayContext.Provider>
}
