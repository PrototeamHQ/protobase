import { relayPresencePath, type RealtimeRelayOptions } from '@protobase/server'

/** How long a person who closed their last socket still counts as present, so a phone that reconnects never goes offline. */
const presenceGraceSeconds = 30

// The API's system path, `/api` for the default `/api/v1`.
const systemPath = (apiPath = '/api/v1') => apiPath.slice(0, apiPath.lastIndexOf('/'))

const presenceEntry = (presence: NonNullable<RealtimeRelayOptions['presence']>, appUrl: string | undefined, apiPath: string | undefined) => {
  if (!appUrl) throw new Error("realtime.relay.presence needs the app's url (url or PROTOBASE_URL), where the relay posts its presence reports")
  return { url: new URL(relayPresencePath(systemPath(apiPath)), appUrl).href, key: presence.key, grace_seconds: presenceGraceSeconds }
}

/** The app's entry in the relay's apps file: its id, its keys, the browser origin of its URL and, with presence, where its reports go. */
export const relayAppEntry = (relay: RealtimeRelayOptions, appUrl: string | undefined, apiPath?: string) => ({
  id: relay.app,
  api_keys: [relay.apiKey],
  ticket_keys: [relay.ticketKey],
  origins: appUrl ? [new URL(appUrl).origin] : [],
  ...(relay.presence && { presence: presenceEntry(relay.presence, appUrl, apiPath) }),
})
