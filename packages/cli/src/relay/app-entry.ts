import type { RealtimeRelayOptions } from '@protobase/server'

/** The app's entry in the relay's apps file: its id, its keys and the browser origin of its URL. */
export const relayAppEntry = (relay: RealtimeRelayOptions, appUrl: string | undefined) => ({
  id: relay.app,
  api_keys: [relay.apiKey],
  ticket_keys: [relay.ticketKey],
  origins: appUrl ? [new URL(appUrl).origin] : [],
})
