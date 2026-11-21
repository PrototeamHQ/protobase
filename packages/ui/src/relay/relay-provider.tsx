import { useEffect, useState, type ReactNode } from 'react'
import { useOptionalAuth } from '../auth/auth-provider'
import { useClient } from '../data/api-provider'
import { useAdminMeta } from '../app/meta-gate'
import { RelayContext, type RelayContextValue } from './relay-context'
import { createRelayStore } from './relay-store'

/** Whether the page is in view: `away` while it is hidden, as the relay's presence takes it. */
const presenceOfPage = () => (document.visibilityState === 'hidden' ? 'away' : 'online')

/**
 * Follows the app's realtime relay for someone signed in, when the app has one: one socket for the page, which the
 * conversation pages, the sidebar and the live updates beneath it share. It tells the relay the person is away while
 * the page is hidden, and online again once it shows.
 */
export const RelayProvider = ({ children }: { children: ReactNode }) => {
  const meta = useAdminMeta()
  const client = useClient()
  const auth = useOptionalAuth()
  const me = auth?.state.kind === 'signed-in' ? auth.state.user.id : undefined
  const on = Boolean(meta.relay) && me !== undefined
  const [value, setValue] = useState<RelayContextValue>()

  useEffect(() => {
    if (!on) return
    const store = createRelayStore()
    const stop = client.relay.follow(store.handlers)
    const tell = () => client.relay.presence(presenceOfPage())
    tell()
    document.addEventListener('visibilitychange', tell)
    setValue({ relay: client.relay, store, me: me! })
    return () => {
      document.removeEventListener('visibilitychange', tell)
      stop()
      store.stop()
      setValue(undefined)
    }
  }, [client, on, me])

  return <RelayContext.Provider value={value}>{children}</RelayContext.Provider>
}
