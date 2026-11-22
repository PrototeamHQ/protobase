import type { Frame } from './phoenix-frame'
import { relaySocket, type RelaySocketOptions } from './relay-socket'
import { RelayRefusal, type RelayEvent, type RelayHandlers, type RelayNotice, type RelayStatus } from './relay-types'

/** The relay's own topic: direct events, and the person's presence. */
export const relayTopic = 'relay'

/** Whether someone is at the page: `away` while it is hidden or the device sleeps, `online` once it is back. */
export type OwnPresence = 'online' | 'away'

type Options = Omit<RelaySocketOptions, 'onOpen' | 'onDown' | 'onEnded' | 'onFrame'>

// A refusal a caller does not wait for, such as a join of a channel the person left, changes nothing.
const quietly = (error: unknown) => {
  if (error instanceof RelayRefusal) return
  throw error
}

const isNotice = (payload: Record<string, unknown>): payload is RelayNotice =>
  typeof payload.kind === 'string' && typeof payload.resource === 'string' && typeof payload.key === 'string' && typeof payload.channel === 'string'

const isEvent = (payload: Record<string, unknown>): payload is RelayEvent =>
  typeof payload.event === 'string' && typeof payload.payload === 'object' && payload.payload !== null && typeof (payload.from as RelayEvent['from'] | undefined)?.user === 'string'

/**
 * The client's realtime relay: one socket for every caller of `follow`, opened by the first and closed after the last.
 * It joins the relay topic and every channel the ticket lists, and any channel asked for with `join`, and tells each
 * follower every change notice and client event. Once it connected again after a drop, followers hear `onResync`.
 */
export const relayClient = (options: Options) => {
  const followers = new Set<RelayHandlers>()
  // The channels the socket joined, and those asked for beyond the ticket's, with how many ask.
  const joined = new Set<string>()
  const asked = new Map<string, number>()
  const viewing = new Map<string, readonly string[]>()
  let status: RelayStatus = 'connecting'
  let presence: OwnPresence = 'online'
  let joins = 0

  const each = (call: (handlers: RelayHandlers) => void) => {
    for (const handlers of [...followers]) call(handlers)
  }
  const setStatus = (next: RelayStatus) => {
    status = next
    each((handlers) => handlers.onStatus?.(next))
  }

  const join = (topic: string) => {
    const interest = viewing.get(topic)
    socket
      .request(topic, 'phx_join', interest ? { viewing: interest } : {}, String(++joins))
      .then(() => void joined.add(topic))
      .catch(quietly)
  }

  const hear = (frame: Frame) => {
    if (frame.event === 'phx_close' || frame.event === 'phx_error') return void joined.delete(frame.topic)
    if (frame.event === 'change') {
      if (isNotice(frame.payload)) each((handlers) => handlers.onNotice?.(frame.payload as RelayNotice))
      return
    }
    if (frame.event === 'client_event') {
      if (isEvent(frame.payload)) each((handlers) => handlers.onEvent?.(frame.payload as RelayEvent))
      return
    }
    each((handlers) => handlers.onPublished?.({ channel: frame.topic, event: frame.event, payload: frame.payload }))
  }

  const socket = relaySocket({
    ...options,
    onOpen: (channels, again) => {
      joined.clear()
      socket
        .request(relayTopic, 'phx_join', {}, String(++joins))
        .then(() => {
          joined.add(relayTopic)
          if (presence === 'away') return socket.request(relayTopic, 'presence', { status: presence })
        })
        .catch(quietly)
      for (const channel of new Set([...channels, ...asked.keys()])) join(channel)
      setStatus('open')
      if (again) each((handlers) => handlers.onResync?.())
    },
    onDown: () => {
      joined.clear()
      setStatus('connecting')
    },
    onEnded: () => setStatus('ended'),
    onFrame: hear,
  })

  const joinedOrRefuse = (channel: string) => {
    if (!joined.has(channel)) throw new RelayRefusal('not_joined')
  }

  return {
    /** Hears every notice and event until the returned function is called; the first follower opens the socket, the last closes it. */
    follow: (handlers: RelayHandlers) => {
      const follower = { ...handlers }
      followers.add(follower)
      socket.start()
      return () => {
        if (!followers.delete(follower) || followers.size > 0) return
        socket.stop()
        joined.clear()
        status = 'connecting'
      }
    },
    status: () => status,
    /** Whether the socket joined the channel, `<resource>/<key>`: the person is a member, or it is an open channel they asked for. */
    joined: (channel: string) => joined.has(channel),
    /**
     * Joins a channel the ticket did not list, such as one the person was added to after connecting, and joins it again
     * after each reconnect until the returned function is called. The socket stays in the channel until it next
     * connects, so its notices keep coming meanwhile. A channel the relay refuses stays unjoined.
     */
    join: (channel: string) => {
      asked.set(channel, (asked.get(channel) ?? 0) + 1)
      if (status === 'open' && !joined.has(channel)) join(channel)
      return () => {
        const left = (asked.get(channel) ?? 1) - 1
        if (left > 0) asked.set(channel, left)
        else asked.delete(channel)
      }
    },
    /** Sends a declared event to the channel's other sockets; rejects with the relay's `RelayRefusal`, such as `rate_limited`. */
    send: async (channel: string, event: string, payload: Record<string, unknown>) => {
      joinedOrRefuse(channel)
      await socket.request(channel, event, payload)
    },
    /** Sends a declared direct event to every device of one person who shares a channel with the sender. */
    direct: async (to: string, event: string, payload: Record<string, unknown>) => {
      joinedOrRefuse(relayTopic)
      await socket.request(relayTopic, event, { to, payload })
    },
    /**
     * Says which keys the page views in a channel, such as the thread open, so the app's notices about other keys pass
     * this socket by; `undefined` views everything again. Kept across reconnects.
     */
    view: (channel: string, keys: readonly string[] | undefined) => {
      if (keys) viewing.set(channel, keys)
      else viewing.delete(channel)
      if (joined.has(channel)) void socket.request(channel, 'interest', keys ? { viewing: keys } : {}).catch(quietly)
    },
    /** Connects again at once when the socket is down and waiting to try again, such as when the page shows again or the device is back online. */
    reconnect: () => socket.wake(),
    /** Tells the relay whether the person is at the page, as the app's presence takes it over all their devices. */
    presence: (next: OwnPresence) => {
      if (next === presence) return
      presence = next
      if (joined.has(relayTopic)) void socket.request(relayTopic, 'presence', { status: next }).catch(quietly)
    },
  }
}

export type RelayClient = ReturnType<typeof relayClient>
