import { relayClientEvents, relayPresencePath, typingResources, type RealtimeRelayOptions } from '@protobase/server'
import type { ViewModel } from '@protobase/schema'

/** How long a person who closed their last socket still counts as present, so a phone that reconnects never goes offline. */
const presenceGraceSeconds = 30

// The API's system path, `/api` for the default `/api/v1`.
const systemPath = (apiPath = '/api/v1') => apiPath.slice(0, apiPath.lastIndexOf('/'))

const presenceEntry = (presence: NonNullable<RealtimeRelayOptions['presence']>, appUrl: string | undefined, apiPath: string | undefined) => {
  if (!appUrl) throw new Error("realtime.relay.presence needs the app's url (url or PROTOBASE_URL), where the relay posts its presence reports")
  return { url: new URL(relayPresencePath(systemPath(apiPath)), appUrl).href, key: presence.key, grace_seconds: presenceGraceSeconds }
}

/** What the entry is made from besides `realtime.relay`: the app's URL, its API path and its views. */
export type RelayAppSource = { url: string | undefined; apiPath?: string; views: readonly ViewModel[] }

/**
 * The app's entry in the relay's apps file: its id, its keys, the browser origin of its URL, the events its clients
 * may send on each channel resource, typing included where a conversation page types, and, with presence, where its
 * reports go.
 */
export const relayAppEntry = (relay: RealtimeRelayOptions, { url, apiPath, views }: RelayAppSource) => {
  const clientEvents = relayClientEvents(relay.channels, typingResources(views))
  return {
    id: relay.app,
    api_keys: [relay.apiKey],
    ticket_keys: [relay.ticketKey],
    origins: url ? [new URL(url).origin] : [],
    ...(clientEvents && { client_events: clientEvents }),
    ...(relay.presence && { presence: presenceEntry(relay.presence, url, apiPath) }),
  }
}
