import type { Caller } from '../api-keys/resolve-caller'
import { HttpProblem } from '../problem'
import { randomUUID } from 'node:crypto'
import type { Entry } from '../registry'
import { decodeBroadcastPush, encodeBroadcast, fitsFrame } from './broadcast-frame'
import type { BroadcastHub, BroadcastMember } from './broadcast-hub'
import type { ChangeHub } from './change-hub'
import { decodeMessage, encodeMessage, reply, type PhoenixMessage, type Vsn } from './phoenix-message'
import { parseBindings } from './postgres-changes'
import type { PresenceHub, PresenceSeat } from './presence-hub'

export type RealtimeSocketOptions = {
  vsn: Vsn
  send: (frame: string | ArrayBuffer) => void
  close: () => void
  /** The caller of the socket's key with an access token: the key's own role without one. Refuses with a 401 problem. */
  resolve: (token: string | undefined) => Promise<Caller>
  /** The live resources, which channels may listen to. */
  live: readonly Entry[]
  hub: ChangeHub
  broadcasts: BroadcastHub
  presences: PresenceHub
  /** The next binding id, unique in the process. */
  nextId: () => number
  report: (error: unknown) => void
  /** How long a socket may stay silent before it is closed; realtime-js sends a heartbeat every 25 seconds. */
  idleMs?: number
  now?: () => number
}

type Channel = {
  joinRef: string | null
  caller: Caller
  /** Whether each broadcast it sends gets a reply. */
  ack: boolean
  member: BroadcastMember
  presence: PresenceSeat
  remove: () => void
  expiry?: ReturnType<typeof setTimeout>
}

const tokenOf = (payload: Record<string, unknown>) => (typeof payload.access_token === 'string' && payload.access_token !== '' ? payload.access_token : undefined)

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

// A refused token or key is the problem's own text; anything else is not the client's to read.
const refusal = (error: unknown) => {
  if (error instanceof HttpProblem && error.status === 401) return error.detail
  throw error
}

/**
 * One WebSocket of `/realtime/v1`, speaking Phoenix channels as realtime-js expects: heartbeats, channel joins with
 * `postgres_changes` bindings and an access token, token refreshes on an open channel, broadcasts with their `self`
 * and `ack` options, presence tracking, and leaves. A channel's token ends it when it expires, unless a newer one came
 * first. Messages are handled one at a time, in order. Private channels are refused for now.
 */
export const realtimeSocket = ({ vsn, send, close, resolve, live, hub, broadcasts, presences, nextId, report, idleMs = 60_000, now = Date.now }: RealtimeSocketOptions) => {
  const channels = new Map<string, Channel>()
  let queue = Promise.resolve()
  let idle: ReturnType<typeof setTimeout> | undefined

  const push = (message: PhoenixMessage) => send(encodeMessage(vsn, message))
  const toChannel = (topic: string, channel: Channel, event: string, payload: Record<string, unknown>) => push({ joinRef: channel.joinRef, ref: null, topic, event, payload })

  // A vsn 2.0.0 client reads broadcasts as binary frames; a vsn 1.0.0 one reads text only, which cannot carry the bytes
  // of a binary broadcast, so it does not hear those.
  const hear = (topic: string, channel: Channel, event: string, payload: unknown) => {
    if (vsn === '2.0.0') return send(encodeBroadcast(topic, event, payload))
    if (payload instanceof ArrayBuffer) return
    toChannel(topic, channel, 'broadcast', { type: 'broadcast', event, payload })
  }

  const leave = (topic: string) => {
    const channel = channels.get(topic)
    if (!channel) return
    channel.remove()
    clearTimeout(channel.expiry)
    channels.delete(topic)
  }

  // Ends the channel with a system error, as Supabase does when its token is refused or expires.
  const end = (topic: string, message: string) => {
    const channel = channels.get(topic)
    if (!channel) return
    toChannel(topic, channel, 'system', { extension: 'system', status: 'error', message })
    toChannel(topic, channel, 'phx_close', {})
    leave(topic)
  }

  const expireAt = (topic: string, channel: Channel) => {
    clearTimeout(channel.expiry)
    const exp = channel.caller.role === 'authenticated' ? channel.caller.claims.exp : undefined
    if (exp === undefined) return
    channel.expiry = setTimeout(() => end(topic, 'Token has expired'), Math.max(0, exp * 1000 - now()))
  }

  const join = async (message: PhoenixMessage) => {
    leave(message.topic)
    const config = isRecord(message.payload.config) ? message.payload.config : {}
    if (config.private === true) return push(reply(message, 'error', { reason: 'Not implemented: private channels' }))
    const broadcast = isRecord(config.broadcast) ? config.broadcast : {}
    const presence = isRecord(config.presence) ? config.presence : {}
    const caller = await resolve(tokenOf(message.payload)).catch(refusal)
    if (typeof caller === 'string') return push(reply(message, 'error', { reason: caller }))
    const parsed = parseBindings(config.postgres_changes, live, nextId)
    if (typeof parsed === 'string') return push(reply(message, 'error', { reason: parsed }))
    const { topic } = message
    const member: BroadcastMember = { self: broadcast.self === true, receive: (event, payload) => hear(topic, channel, event, payload) }
    // Supabase tracks a channel that names no key under a key of its own.
    const key = typeof presence.key === 'string' && presence.key !== '' ? presence.key : randomUUID()
    const listens = presence.enabled === true
    const seat = presences.join(topic, { key, listens, receive: (diff) => toChannel(topic, channel, 'presence_diff', diff) })
    const offBroadcast = broadcasts.join(topic, member)
    const offChanges = parsed.bindings.length > 0 ? hub.add({ caller: () => channel.caller, bindings: parsed.bindings, send: (payload) => toChannel(topic, channel, 'postgres_changes', payload) }) : () => {}
    const channel: Channel = {
      joinRef: message.joinRef,
      caller,
      ack: broadcast.ack === true,
      member,
      presence: seat,
      remove: () => {
        offChanges()
        offBroadcast()
        seat.leave()
      },
    }
    channels.set(topic, channel)
    expireAt(topic, channel)
    push(reply(message, 'ok', { postgres_changes: parsed.replies }))
    if (listens) toChannel(topic, channel, 'presence_state', seat.state())
    if (parsed.bindings.length > 0) {
      toChannel(message.topic, channel, 'system', { extension: 'postgres_changes', status: 'ok', message: 'Subscribed to PostgreSQL', channel: message.topic.replace(/^realtime:/, '') })
    }
  }

  const refresh = async (message: PhoenixMessage) => {
    const caller = await resolve(tokenOf(message.payload)).catch(refusal)
    const channel = channels.get(message.topic)
    if (!channel) return
    if (typeof caller === 'string') return end(message.topic, caller)
    channel.caller = caller
    expireAt(message.topic, channel)
  }

  const sendBroadcast = (message: PhoenixMessage, channel: Channel) => {
    const { event, payload } = message.payload
    if (typeof event !== 'string') return push(reply(message, 'error', { reason: 'A broadcast needs an event' }))
    if (!fitsFrame(message.topic) || !fitsFrame(event)) return push(reply(message, 'error', { reason: 'A broadcast topic and event are at most 255 bytes each' }))
    broadcasts.send(message.topic, channel.member, event, payload)
    if (channel.ack) push(reply(message, 'ok', {}))
  }

  const updatePresence = (message: PhoenixMessage, channel: Channel) => {
    const { event, payload } = message.payload
    if (event === 'track' && isRecord(payload)) channel.presence.track(payload)
    else if (event === 'untrack') channel.presence.untrack()
    else return push(reply(message, 'error', { reason: 'A presence message tracks an object or untracks' }))
    push(reply(message, 'ok', {}))
  }

  const handle = async (message: PhoenixMessage) => {
    if (message.topic === 'phoenix') {
      if (message.event === 'heartbeat') push(reply(message, 'ok', {}))
      return
    }
    if (message.event === 'phx_join') return join(message)
    const channel = channels.get(message.topic)
    if (!channel) return push(reply(message, 'error', { reason: 'unmatched topic' }))
    if (message.event === 'access_token') return refresh(message)
    if (message.event === 'broadcast') return sendBroadcast(message, channel)
    if (message.event === 'presence') return updatePresence(message, channel)
    if (message.event === 'phx_leave') {
      leave(message.topic)
      push(reply(message, 'ok', {}))
      return push({ joinRef: message.joinRef, ref: message.ref, topic: message.topic, event: 'phx_close', payload: {} })
    }
    push(reply(message, 'error', { reason: `Not implemented: ${message.event}` }))
  }

  const stayAwake = () => {
    clearTimeout(idle)
    idle = setTimeout(close, idleMs)
  }
  stayAwake()

  return {
    /** Handles a frame after those before it: text, or binary for a broadcast. */
    message: (frame: string | ArrayBuffer) => {
      stayAwake()
      const message = typeof frame === 'string' ? decodeMessage(vsn, frame) : decodeBroadcastPush(frame)
      if (!message) return
      queue = queue.then(() => handle(message)).catch((error: unknown) => {
        report(error)
        close()
      })
    },
    /** Ends every channel of a socket that closed. */
    closed: () => {
      clearTimeout(idle)
      for (const topic of [...channels.keys()]) leave(topic)
    },
  }
}
