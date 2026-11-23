import { relayClientEvents, relayPresencePath, typingResources, type RealtimeRelayOptions, type RealtimeRelaySettings } from '@protobase/server'
import type { ViewModel } from '@protobase/schema'

/** How long a person who closed their last socket still counts as present, so a phone that reconnects never goes offline. */
const presenceGraceSeconds = 30

// The API's system path, `/api` for the default `/api/v1`.
const systemPath = (apiPath = '/api/v1') => apiPath.slice(0, apiPath.lastIndexOf('/'))

/** What the app's part of the entry is made from besides `realtime.relay`: its API path and its views. */
export type RelayAppBuild = { apiPath?: string; views: readonly ViewModel[] }

/**
 * The part of the app's entry in the relay's apps file that its build decides, without its address, id or any key: the
 * events its clients may send on each channel resource, typing included where a conversation page types, and, with
 * presence, the path of the app's endpoint its reports go to and their grace. `protobase build` writes it into the
 * bundle's manifest, and `relayAppEntry` builds on it.
 */
export const relayAppPart = (relay: Pick<RealtimeRelaySettings, 'channels'> & Pick<RealtimeRelayOptions, 'presence'>, { apiPath, views }: RelayAppBuild) => {
  const clientEvents = relayClientEvents(relay.channels, typingResources(views))
  return {
    ...(clientEvents && { client_events: clientEvents }),
    ...(relay.presence && { presence: { path: relayPresencePath(systemPath(apiPath)), grace_seconds: presenceGraceSeconds } }),
  }
}

type PresencePart = NonNullable<ReturnType<typeof relayAppPart>['presence']>

const presenceEntry = ({ path, grace_seconds }: PresencePart, key: string, appUrl: string | undefined) => {
  if (!appUrl) throw new Error("realtime.relay.presence needs the app's url (url or PROTOBASE_URL), where the relay posts its presence reports")
  return { url: new URL(path, appUrl).href, key, grace_seconds }
}

/** What the entry is made from besides `realtime.relay`: the app's URL, its API path and its views. */
export type RelayAppSource = RelayAppBuild & { url: string | undefined }

/**
 * The app's entry in the relay's apps file: its id, its keys, the browser origin of its URL, and its part of the build
 * (`relayAppPart`), with presence's endpoint at the app's URL and its key.
 */
export const relayAppEntry = (relay: RealtimeRelaySettings, { url, ...build }: RelayAppSource) => {
  const { client_events, presence } = relayAppPart(relay, build)
  return {
    id: relay.app,
    api_keys: [relay.apiKey],
    ticket_keys: [relay.ticketKey],
    origins: url ? [new URL(url).origin] : [],
    ...(client_events && { client_events }),
    ...(presence && relay.presence && { presence: presenceEntry(presence, relay.presence.key, url) }),
  }
}
