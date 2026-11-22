import { createContext, useContext, useSyncExternalStore } from 'react'
import type { RelayClient } from '@protobase/client'
import type { RelayStore } from './relay-store'
import { typersOn } from './typing'

/** The app's relay as the page follows it, for someone signed in to an app with `realtime.relay` (see `RelayProvider`). */
export type RelayContextValue = { relay: RelayClient; store: RelayStore; me: string }

export const RelayContext = createContext<RelayContextValue | undefined>(undefined)

/** The relay the page follows, undefined in an app without one or for a visitor. */
export const useRelay = () => useContext(RelayContext)

const nobody = () => () => {}
const none = () => undefined

/** Who of the others types on the channel `<resource>/<key>` now, by user id; empty without the relay. */
export const useTypers = (channel: string) => {
  const context = useRelay()
  const typers = useSyncExternalStore(context?.store.subscribe ?? nobody, context?.store.typers ?? none, context?.store.typers ?? none)
  return typers && context ? typersOn(typers, channel, context.me) : []
}

/** The channels on which someone other than the reader types now. */
export const useTypingChannels = () => {
  const context = useRelay()
  const typers = useSyncExternalStore(context?.store.subscribe ?? nobody, context?.store.typers ?? none, context?.store.typers ?? none)
  if (!typers || !context) return new Set<string>()
  return new Set([...typers.keys()].filter((channel) => typersOn(typers, channel, context.me).length > 0))
}
