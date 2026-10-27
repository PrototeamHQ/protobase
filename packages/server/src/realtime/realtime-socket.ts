import type { Caller } from '../api-keys/resolve-caller'
import { HttpProblem } from '../problem'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import type { Entry } from '../registry'
import { decodeBroadcastPush, encodeBroadcast, fitsFrame, type BroadcastMeta } from './broadcast-frame'
import type { BroadcastHub, BroadcastMember } from './broadcast-hub'
import type { ChangeHub } from './change-hub'
import type { ChannelAccess } from './channel-access'
import { privateGate, publicGate, readRefusalText, type ChannelGate } from './channel-gate'
import { fixedWindow, fixedWindows } from './fixed-window'
import { decodeMessage, encodeMessage, reply, type PhoenixMessage, type Vsn } from './phoenix-message'
import { parseBindings } from './postgres-changes'
import type { PresenceHub, PresenceSeat } from './presence-hub'
import { realtimeLimits } from './realtime-limits'

export type RealtimeSocketOptions = {
  vsn: Vsn
  send: (frame: string | ArrayBuffer) => void
  /** The bytes the socket was sent and has not written out to the client yet. */
  buffered: () => number
  close: (code?: number) => void
  /** The caller of the socket's key with an access token: the key's own role without one. Refuses with a 401 problem. */
  resolve: (token: string | undefined) => Promise<Caller>
  /** The live resources, which channels may listen to. */
  live: readonly Entry[]
  hub: ChangeHub
  broadcasts: BroadcastHub
  presences: PresenceHub
  /** What private channels may do, by the policies on `realtime.messages`. */
  access: ChannelAccess
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
  gate: ChannelGate
  /** Whether each broadcast it sends gets a reply. */
  ack: boolean
  member: BroadcastMember
  presence: PresenceSeat
  remove: () => void
  expiry?: ReturnType<typeof setTimeout>
}

const tokenOf = (payload: Record<string, unknown>) => (typeof payload.access_token === 'string' && payload.access_token !== '' ? payload.access_token : undefined)

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

// A frame over the size cap, and a client that does not keep up with what it is sent or that sends too much at once.
const messageTooBig = 1009
const policyViolation = 1008

// NaN for a kind of frame whose size is unknown, which is refused as too big.
const frameBytes = (frame: unknown) => {
  if (typeof frame === 'string') return Buffer.byteLength(frame)
  if (frame instanceof ArrayBuffer || ArrayBuffer.isView(frame)) return frame.byteLength
  if (frame instanceof Blob) return frame.size
  return NaN
}

const tooFast = 'Too many messages per second'

// A refused token or key is the problem's own text; anything else is not the client's to read.
const refusal = (error: unknown) => {
  if (error instanceof HttpProblem && error.status === 401) return error.detail
  throw error
}

/**
 * One WebSocket of `/api/sb/realtime/v1`, speaking Phoenix channels as realtime-js expects: heartbeats, channel joins with
 * `postgres_changes` bindings and an access token, token refreshes on an open channel, broadcasts with their `self`
 * and `ack` options, presence tracking, and leaves. A channel's token ends it when it expires, unless a newer one came
 * first. Messages are handled one at a time, in order. A private channel joins, hears, broadcasts and tracks presence
 * only as the policies on `realtime.messages` allow (see `privateGate`), checked again at each new token.
 *
 * It holds a client to `realtimeLimits`: a push over a rate, a channel over the cap or a presence meta too big gets an
 * error reply where Supabase would close the channel, and is not relayed. Rates count per socket, presence per socket
 * and topic, so leaving and joining again does not reset them; the broadcast hub counts each topic's. The socket is
 * closed, 1009, for a frame over the size cap, and 1008 when its client leaves too much unread or sends too much while
 * earlier messages wait. A close, the client's or the server's, leaves every channel, a join still checking its token
 * included, and drops whatever is still queued.
 */
export const realtimeSocket = ({ vsn, send, buffered, close, resolve, live, hub, broadcasts, presences, access, nextId, report, idleMs = 60_000, now = Date.now }: RealtimeSocketOptions) => {
  const channels = new Map<string, Channel>()
  let queue = Promise.resolve()
  let queuedMessages = 0
  let queuedBytes = 0
  let idle: ReturnType<typeof setTimeout> | undefined
  let open = true
  const events = fixedWindow(realtimeLimits.eventsPerSecond, 1000, now)
  const joins = fixedWindow(realtimeLimits.joinsPerSecond, 1000, now)
  const presenceRate = fixedWindows(realtimeLimits.presencePerWindow, realtimeLimits.presenceWindowMs, now)

  const leaveAll = () => {
    open = false
    clearTimeout(idle)
    for (const topic of [...channels.keys()]) leave(topic)
  }

  // Every close the server makes. It sends nothing more at once, and leaves just after: it may come from inside a hub's
  // loop, as a member's delivery, and the members after it then hear that diff before its leave.
  const shut = (code?: number) => {
    if (!open) return
    open = false
    clearTimeout(idle)
    close(code)
    Promise.resolve().then(leaveAll).catch(report)
  }

  // A client that has not read what it was sent gets no more: `!(… <= …)` closes for an amount that is not a number too.
  const deliver = (frame: string | ArrayBuffer) => {
    if (!open) return
    if (!(buffered() <= realtimeLimits.maxUnsentBytes)) return shut(policyViolation)
    send(frame)
  }

  const push = (message: PhoenixMessage) => deliver(encodeMessage(vsn, message))
  const toChannel = (topic: string, channel: Channel, event: string, payload: Record<string, unknown>) => push({ joinRef: channel.joinRef, ref: null, topic, event, payload })

  // A vsn 2.0.0 client reads broadcasts as binary frames; a vsn 1.0.0 one reads text only, which cannot carry the bytes
  // of a binary broadcast, so it does not hear those.
  const hear = (topic: string, channel: Channel, event: string, payload: unknown, meta?: BroadcastMeta) => {
    if (!channel.gate.hears('broadcast')) return
    if (vsn === '2.0.0') return deliver(encodeBroadcast(topic, event, payload, meta))
    if (payload instanceof ArrayBuffer) return
    toChannel(topic, channel, 'broadcast', { type: 'broadcast', event, payload, ...(meta && { meta }) })
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

  // Refused before the channel it replaces is left, and before a token check.
  const join = async (message: PhoenixMessage) => {
    if (!joins()) return push(reply(message, 'error', { reason: 'ClientJoinRateLimitReached: Too many joins per second' }))
    if (!fitsFrame(message.topic)) return push(reply(message, 'error', { reason: 'A topic is at most 255 bytes' }))
    if (!channels.has(message.topic) && channels.size >= realtimeLimits.channelsPerSocket) return push(reply(message, 'error', { reason: 'ChannelRateLimitReached: Too many channels' }))
    leave(message.topic)
    const config = isRecord(message.payload.config) ? message.payload.config : {}
    const broadcast = isRecord(config.broadcast) ? config.broadcast : {}
    const presence = isRecord(config.presence) ? config.presence : {}
    const listens = presence.enabled === true
    const gate = config.private === true ? privateGate(access, message.topic, listens, report) : publicGate
    const caller = await resolve(tokenOf(message.payload)).catch(refusal)
    if (!open) return
    if (typeof caller === 'string') return push(reply(message, 'error', { reason: caller }))
    const refused = await gate.authorize(caller)
    if (!open) return
    if (refused) return push(reply(message, 'error', { reason: `Unauthorized: ${readRefusalText(message.topic, refused)}` }))
    const parsed = parseBindings(config.postgres_changes, live, nextId)
    if (typeof parsed === 'string') return push(reply(message, 'error', { reason: parsed }))
    const { topic } = message
    const member: BroadcastMember = { self: broadcast.self === true, private: config.private === true, receive: (event, payload, meta) => hear(topic, channel, event, payload, meta) }
    // Supabase tracks a channel that names no key under a key of its own.
    const key = typeof presence.key === 'string' && presence.key !== '' ? presence.key : randomUUID()
    const seat = presences.join(topic, { key, private: config.private === true, get listens() { return listens && gate.hears('presence') }, receive: (diff) => toChannel(topic, channel, 'presence_diff', diff) })
    const offBroadcast = broadcasts.join(topic, member)
    const offChanges = parsed.bindings.length > 0 ? hub.add({ caller: () => channel.caller, bindings: parsed.bindings, send: (payload) => toChannel(topic, channel, 'postgres_changes', payload) }) : () => {}
    const channel: Channel = {
      joinRef: message.joinRef,
      caller,
      gate,
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
    if (listens && gate.hears('presence')) toChannel(topic, channel, 'presence_state', seat.state())
    if (parsed.bindings.length > 0) {
      toChannel(message.topic, channel, 'system', { extension: 'postgres_changes', status: 'ok', message: 'Subscribed to PostgreSQL', channel: message.topic.replace(/^realtime:/, '') })
    }
  }

  const refresh = async (message: PhoenixMessage) => {
    const caller = await resolve(tokenOf(message.payload)).catch(refusal)
    const channel = channels.get(message.topic)
    if (!channel) return
    if (typeof caller === 'string') return end(message.topic, caller)
    const refused = await channel.gate.authorize(caller)
    if (channels.get(message.topic) !== channel) return
    if (refused) return end(message.topic, readRefusalText(message.topic, refused))
    channel.caller = caller
    expireAt(message.topic, channel)
  }

  const sendBroadcast = async (message: PhoenixMessage, channel: Channel) => {
    const { event, payload } = message.payload
    if (!events()) return push(reply(message, 'error', { reason: tooFast }))
    if (typeof event !== 'string') return push(reply(message, 'error', { reason: 'A broadcast needs an event' }))
    if (!fitsFrame(message.topic) || !fitsFrame(event)) return push(reply(message, 'error', { reason: 'A broadcast topic and event are at most 255 bytes each' }))
    const allowed = await channel.gate.mayWrite(channel.caller, 'broadcast')
    if (channels.get(message.topic) !== channel) return
    // Supabase's own reply to a broadcast the policies refuse, as to a track below.
    if (!allowed) return push(reply(message, 'error', { error: 'unauthorized' }))
    if (!broadcasts.send(message.topic, channel.member, event, payload)) return push(reply(message, 'error', { reason: `${tooFast} on this topic` }))
    if (channel.ack) push(reply(message, 'ok', {}))
  }

  const updatePresence = async (message: PhoenixMessage, channel: Channel) => {
    const { event, payload } = message.payload
    if (!events()) return push(reply(message, 'error', { reason: tooFast }))
    if (!presenceRate(message.topic)) return push(reply(message, 'error', { reason: 'Client presence rate limit exceeded' }))
    if (event === 'untrack') {
      channel.presence.untrack()
      return push(reply(message, 'ok', {}))
    }
    if (event !== 'track' || !isRecord(payload)) return push(reply(message, 'error', { reason: 'A presence message tracks an object or untracks' }))
    if (Buffer.byteLength(JSON.stringify(payload)) > realtimeLimits.maxPresenceBytes) return push(reply(message, 'error', { reason: 'Track message size exceeded' }))
    const allowed = await channel.gate.mayWrite(channel.caller, 'presence')
    if (channels.get(message.topic) !== channel) return
    if (!allowed) return push(reply(message, 'error', {}))
    channel.presence.track(payload)
    push(reply(message, 'ok', {}))
  }

  const handle = async (message: PhoenixMessage) => {
    if (!open) return
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
    idle = setTimeout(() => shut(), idleMs)
  }
  stayAwake()

  const fail = (error: unknown) => {
    report(error)
    shut()
  }

  return {
    /**
     * Handles a frame after those before it: text, or an `ArrayBuffer` for a broadcast. Another kind is ignored, or
     * closes the socket as too big when its size is unknown.
     */
    message: (frame: unknown) => {
      if (!open) return
      const size = frameBytes(frame)
      if (!(size <= realtimeLimits.maxFrameBytes)) return shut(messageTooBig)
      stayAwake()
      const message = typeof frame === 'string' ? decodeMessage(vsn, frame) : frame instanceof ArrayBuffer ? decodeBroadcastPush(frame) : undefined
      if (!message) return
      queuedMessages += 1
      queuedBytes += size
      if (queuedMessages > realtimeLimits.maxQueuedMessages || queuedBytes > realtimeLimits.maxQueuedBytes) return shut(policyViolation)
      queue = queue
        .then(() => handle(message))
        .catch(fail)
        .finally(() => {
          queuedMessages -= 1
          queuedBytes -= size
        })
    },
    /** Ends every channel of a socket that closed. */
    closed: leaveAll,
  }
}
