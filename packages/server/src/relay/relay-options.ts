/** Where a channel resource's membership comes from: a resource whose records each put one person in one channel. */
export type RelayMembers = {
  /** The resource, such as `conversation_members`. */
  resource: string
  /** Its relation field to the channel resource, such as `conversation_id`. */
  channel: string
  /** Its field holding the person's user id, such as `user_id`. */
  user: string
}

/** A resource whose records are channels on the relay, `<resource>/<key>`. */
export type RelayChannelOptions = {
  /**
   * Who is in each channel. Without it the channel is open: whoever may read the record gets it in a ticket when they
   * ask for it, a visitor of the anonymous role too.
   */
  members?: RelayMembers
  /** A field of the records noticed on the channel that lists the user ids a record mentions, such as a message's `mentions`. */
  mentions?: string
  /**
   * The events its members may send each other on a channel through the relay, by name, such as `{ ring: ... }`; the
   * relay refuses any other. A conversation page with `typing` declares `typing` itself.
   */
  events?: Record<string, RelayClientEvent>
}

/** An event clients may send on a channel: its payload's JSON schema and size, and how often one person may send it. */
export type RelayClientEvent = {
  /** The payload's JSON schema, draft 2020-12 unless it names another; it may load no other document. */
  schema: Record<string, unknown>
  /** The payload's largest size in bytes, 1 to 65536. */
  maxBytes: number
  /** How often one person may send it, a second, over all their sockets. */
  perSecond: number
  /** How many one person may send at once before `perSecond` holds them back. */
  burst: number
}

/**
 * Where the relay's presence reports go: a resource of the app's own with one record per person, which the reports
 * keep current, so its changes raise the app's events as any other record's do.
 */
export type RelayPresence = {
  /** The resource, such as `presences`: captured, such as with `.live()`, and keyed by its user field. */
  resource: string
  /** Its field holding the person's user id, its key, such as `user_id`. */
  user: string
  /** Its field holding `online`, `away` or `offline`, such as `status`. */
  status: string
  /** Its timestamp field holding when the status began, such as `since`. */
  at: string
  /** The bearer token the relay's presence reports carry, at least 32 characters. */
  key: string
}

/** The realtime relay the app hands its connections to (`realtime.relay` in `protobase.config.ts`). */
export type RealtimeRelayOptions = {
  /** The relay's address, such as `https://relay.example.com`: its app commands, and its socket at `/socket`. */
  url: string
  /** The app's id on the relay. */
  app: string
  /** One of the app's API keys on the relay, which its commands carry. */
  apiKey: string
  /** One of the app's ticket keys on the relay, which signs the connect tickets. */
  ticketKey: string
  /** The channel resources by name. */
  channels: Record<string, RelayChannelOptions>
  /** Turns on presence: the relay reports who is online, away or offline, and the app keeps it in this resource. */
  presence?: RelayPresence
}

const appPattern = /^[a-z0-9_-]{1,64}$/
const minKeyLength = 32

const maxEventBytes = 65536
// Names the relay keeps for its own frames.
const reservedEvents = new Set(['heartbeat', 'interest', 'presence', 'client_event'])

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.length > 0

const checkEvents = (where: string, events: unknown) => {
  if (typeof events !== 'object' || events === null || Array.isArray(events)) throw new Error(`${where} must be an object of events by name`)
  for (const [name, event] of Object.entries(events as Record<string, RelayClientEvent>)) {
    if (name.length === 0 || new TextEncoder().encode(name).length > 64 || reservedEvents.has(name) || name.startsWith('phx_')) throw new Error(`${where}: "${name}" must be 1 to 64 bytes and none of heartbeat, interest, presence, client_event and phx_*`)
    const schema = event?.schema
    if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) throw new Error(`${where}.${name}.schema must be a JSON schema object`)
    if (!Number.isInteger(event.maxBytes) || event.maxBytes < 1 || event.maxBytes > maxEventBytes) throw new Error(`${where}.${name}.maxBytes must be a whole number from 1 to ${maxEventBytes}`)
    if (typeof event.perSecond !== 'number' || !(event.perSecond > 0) || !Number.isFinite(event.perSecond)) throw new Error(`${where}.${name}.perSecond must be a positive number`)
    if (!Number.isInteger(event.burst) || event.burst < 1) throw new Error(`${where}.${name}.burst must be a positive whole number`)
  }
}

/** The options, or an error naming what is wrong with their shape; `relayModels` checks them against the resources. */
export const checkRelayOptions = (options: RealtimeRelayOptions) => {
  if (!nonEmpty(options?.url) || !/^https?:\/\//.test(options.url)) throw new Error(`realtime.relay.url must start with https:// or http://, not ${JSON.stringify(options?.url)}`)
  if (typeof options.app !== 'string' || !appPattern.test(options.app)) throw new Error(`realtime.relay.app must be 1 to 64 of a-z, 0-9, _ and -, as the relay names the app, not ${JSON.stringify(options.app)}`)
  for (const key of ['apiKey', 'ticketKey'] as const) {
    if (typeof options[key] !== 'string' || options[key].length < minKeyLength) throw new Error(`realtime.relay.${key} must be a string of at least ${minKeyLength} characters, such as from an environment variable`)
  }
  if (typeof options.channels !== 'object' || options.channels === null || Object.keys(options.channels).length === 0) throw new Error('realtime.relay.channels must name at least one channel resource')
  for (const [name, channel] of Object.entries(options.channels)) {
    const members = channel?.members
    if (members !== undefined && !(nonEmpty(members.resource) && nonEmpty(members.channel) && nonEmpty(members.user))) throw new Error(`realtime.relay.channels.${name}.members must be { resource, channel, user }`)
    if (channel?.mentions !== undefined && !nonEmpty(channel.mentions)) throw new Error(`realtime.relay.channels.${name}.mentions must name a field`)
    if (channel?.events !== undefined) checkEvents(`realtime.relay.channels.${name}.events`, channel.events)
  }
  const presence = options.presence
  if (presence !== undefined) {
    if (!(nonEmpty(presence?.resource) && nonEmpty(presence.user) && nonEmpty(presence.status) && nonEmpty(presence.at))) throw new Error('realtime.relay.presence must be { resource, user, status, at, key }')
    if (typeof presence.key !== 'string' || presence.key.length < minKeyLength) throw new Error(`realtime.relay.presence.key must be a string of at least ${minKeyLength} characters, such as from an environment variable`)
  }
  return options
}
