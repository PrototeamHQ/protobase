import type { KeyValue } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import { channelConnection, type ConnectionOptions } from './channel-connection'
import { ChannelRefusal, type ChannelMessage, type ChannelStatus, type PresenceChange, type PresenceEntry, type ServerMessage } from './channel-types'

/** A record's channel as one caller of `client.channel` holds it; `leave` lets it go. */
export type Channel = {
  status: () => ChannelStatus
  /** Follows the status until the returned function is called. */
  onStatus: (listener: (status: ChannelStatus) => void) => () => void
  /** The channel's presence now: every connection on it that tracks a state, this one included. */
  presence: () => PresenceEntry[]
  /** Follows the presence until the returned function is called: the whole of it, and what changed when a diff did it. */
  onPresence: (listener: (entries: PresenceEntry[], change?: PresenceChange) => void) => () => void
  /** Tracks this connection's state on the channel, or replaces it; applied once joined, and again after a reconnect. */
  track: (state: unknown) => Promise<void>
  untrack: () => Promise<void>
  /**
   * Broadcasts to the others on the channel; with `self` this connection hears it too. With `ack` it resolves once the
   * server took it, or rejects with its `ChannelRefusal`; without, once it was sent.
   */
  send: (event: string, payload: unknown, options?: { self?: boolean; ack?: boolean }) => Promise<void>
  /** Hears the channel's broadcasts of `event` until the returned function is called. */
  on: (event: string, listener: (message: ChannelMessage) => void) => () => void
  /** Lets the channel go; the connection leaves it once every holder did, and closes once it holds no channel. */
  leave: () => void
}

// One record's channel on the connection, shared by every holder of it.
type Joined = {
  resource: string
  key: string
  name?: string
  status: ChannelStatus
  presence: Map<string, PresenceEntry>
  tracked?: { state: unknown }
  holders: number
  statusListeners: Set<(status: ChannelStatus) => void>
  presenceListeners: Set<(entries: PresenceEntry[], change?: PresenceChange) => void>
  eventListeners: Map<string, Set<(message: ChannelMessage) => void>>
}

// A message cut off by a drop is sent again once the socket is back and the channel joined; any other refusal stays one.
const unlessDropped = (error: unknown) => {
  if (error instanceof ChannelRefusal && error.code === 'disconnected') return
  throw error
}

const notJoined = () => new ChannelRefusal('not-joined', 'The channel is not joined yet')

/**
 * The client's channels of records (`/api/channels`), all on one socket, opened with the first channel and closed
 * after the last. A dropped socket connects again by itself, joins every channel again and tracks their states again.
 */
export const channelsClient = (options: Omit<ConnectionOptions, 'onOpen' | 'onDown' | 'onMessage'>) => {
  const joined = new Map<string, Joined>()
  const byName = new Map<string, Joined>()

  const setStatus = (channel: Joined, status: ChannelStatus) => {
    channel.status = status
    for (const listener of channel.statusListeners) listener(status)
  }
  const tellPresence = (channel: Joined, change?: PresenceChange) => {
    const entries = [...channel.presence.values()]
    for (const listener of channel.presenceListeners) listener(entries, change)
  }

  const join = (channel: Joined) => {
    connection
      .request({ type: 'join', resource: channel.resource, key: channel.key })
      .then((reply) => {
        if (joined.get(`${channel.resource}/${channel.key}`) !== channel) return
        channel.name = reply.channel!
        byName.set(channel.name, channel)
        setStatus(channel, { state: 'joined' })
        if (channel.tracked) void connection.request({ type: 'track', channel: channel.name, state: channel.tracked.state }).catch(unlessDropped)
      })
      .catch((error: unknown) => {
        if (!(error instanceof ChannelRefusal) || error.code === 'disconnected') return unlessDropped(error)
        setStatus(channel, { state: 'refused', error: { code: error.code, message: error.message } })
      })
  }

  const hear = (message: ServerMessage) => {
    if (message.type === 'pong' || message.type === 'reply' || message.type === 'error') return
    const channel = byName.get(message.channel)
    if (!channel) return
    if (message.type === 'presence') {
      channel.presence = new Map(message.entries.map((entry) => [entry.id, entry]))
      return tellPresence(channel)
    }
    if (message.type === 'presence_diff') {
      for (const entry of message.leaves) channel.presence.delete(entry.id)
      for (const entry of [...message.joins, ...message.updates]) channel.presence.set(entry.id, entry)
      return tellPresence(channel, { joins: message.joins, updates: message.updates, leaves: message.leaves })
    }
    if (message.type === 'broadcast') {
      const { event, payload, user, server } = message
      for (const listener of channel.eventListeners.get(event) ?? []) listener({ event, payload, user, ...(server && { server }) })
      return
    }
    byName.delete(message.channel)
    channel.presence.clear()
    tellPresence(channel)
    setStatus(channel, { state: 'closed', error: message.error })
  }

  const connection = channelConnection({
    ...options,
    onOpen: () => {
      for (const channel of joined.values()) if (channel.status.state === 'joining') join(channel)
    },
    onDown: () => {
      byName.clear()
      for (const channel of joined.values()) if (channel.status.state === 'joined') setStatus(channel, { state: 'joining' })
    },
    onMessage: hear,
  })

  const release = (id: string, channel: Joined) => {
    channel.holders -= 1
    if (channel.holders > 0) return
    joined.delete(id)
    if (channel.name !== undefined) {
      byName.delete(channel.name)
      connection.post({ type: 'leave', channel: channel.name })
    }
    if (joined.size === 0) connection.stop()
  }

  const handleOf = (id: string, channel: Joined): Channel => {
    let left = false
    const own = new Set<() => void>()
    const listen = <T>(set: Set<T>, listener: T) => {
      set.add(listener)
      const off = () => {
        set.delete(listener)
        own.delete(off)
      }
      own.add(off)
      return off
    }
    const joinedName = () => (channel.status.state === 'joined' ? channel.name : undefined)
    return {
      status: () => channel.status,
      onStatus: (listener) => listen(channel.statusListeners, listener),
      presence: () => [...channel.presence.values()],
      onPresence: (listener) => listen(channel.presenceListeners, listener),
      track: async (state) => {
        channel.tracked = { state }
        const name = joinedName()
        if (name !== undefined) await connection.request({ type: 'track', channel: name, state })
      },
      untrack: async () => {
        channel.tracked = undefined
        const name = joinedName()
        if (name !== undefined) await connection.request({ type: 'untrack', channel: name })
      },
      send: async (event, payload, { self, ack } = {}) => {
        const name = joinedName()
        if (name === undefined) throw notJoined()
        const message = { type: 'send', channel: name, event, payload, ...(self && { self }) }
        if (ack) {
          await connection.request({ ...message, ack })
          return
        }
        if (!connection.post(message)) throw new ChannelRefusal('disconnected', 'The connection is down')
      },
      on: (event, listener) => {
        const listeners = channel.eventListeners.get(event) ?? new Set()
        channel.eventListeners.set(event, listeners)
        return listen(listeners, listener)
      },
      leave: () => {
        if (left) return
        left = true
        for (const off of [...own]) off()
        release(id, channel)
      },
    }
  }

  return {
    /** The channel of the record with this key, joined as soon as the socket is open. */
    channel: (resource: string, key: KeyValue | readonly KeyValue[]): Channel => {
      const encoded = encodeKey(key)
      const id = `${resource}/${encoded}`
      const existing = joined.get(id)
      if (existing) {
        existing.holders += 1
        return handleOf(id, existing)
      }
      const channel: Joined = { resource, key: encoded, status: { state: 'joining' }, presence: new Map(), holders: 1, statusListeners: new Set(), presenceListeners: new Set(), eventListeners: new Map() }
      joined.set(id, channel)
      connection.start()
      join(channel)
      return handleOf(id, channel)
    },
  }
}
