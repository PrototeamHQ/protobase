import type { Caller } from '../api-keys/resolve-caller'
import { HttpProblem } from '../problem'
import type { Entry } from '../registry'
import type { ChangeHub } from './change-hub'
import { decodeMessage, encodeMessage, reply, type PhoenixMessage, type Vsn } from './phoenix-message'
import { parseBindings } from './postgres-changes'

export type RealtimeSocketOptions = {
  vsn: Vsn
  send: (frame: string) => void
  close: () => void
  /** The caller of the socket's key with an access token: the key's own role without one. Refuses with a 401 problem. */
  resolve: (token: string | undefined) => Promise<Caller>
  /** The live resources, which channels may listen to. */
  live: readonly Entry[]
  hub: ChangeHub
  /** The next binding id, unique in the process. */
  nextId: () => number
  report: (error: unknown) => void
  /** How long a socket may stay silent before it is closed; realtime-js sends a heartbeat every 25 seconds. */
  idleMs?: number
  now?: () => number
}

type Channel = { joinRef: string | null; caller: Caller; remove: () => void; expiry?: ReturnType<typeof setTimeout> }

const tokenOf = (payload: Record<string, unknown>) => (typeof payload.access_token === 'string' && payload.access_token !== '' ? payload.access_token : undefined)

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

// A refused token or key is the problem's own text; anything else is not the client's to read.
const refusal = (error: unknown) => {
  if (error instanceof HttpProblem && error.status === 401) return error.detail
  throw error
}

/**
 * One WebSocket of `/realtime/v1`, speaking Phoenix channels as realtime-js expects: heartbeats, channel joins with
 * `postgres_changes` bindings and an access token, token refreshes on an open channel, and leaves. A channel's token
 * ends it when it expires, unless a newer one came first. Messages are handled one at a time, in order. Broadcast,
 * presence and private channels are refused for now.
 */
export const realtimeSocket = ({ vsn, send, close, resolve, live, hub, nextId, report, idleMs = 60_000, now = Date.now }: RealtimeSocketOptions) => {
  const channels = new Map<string, Channel>()
  let queue = Promise.resolve()
  let idle: ReturnType<typeof setTimeout> | undefined

  const push = (message: PhoenixMessage) => send(encodeMessage(vsn, message))
  const toChannel = (topic: string, channel: Channel, event: string, payload: Record<string, unknown>) => push({ joinRef: channel.joinRef, ref: null, topic, event, payload })

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
    if (isRecord(config.presence) && config.presence.enabled === true) return push(reply(message, 'error', { reason: 'Not implemented: presence' }))
    const caller = await resolve(tokenOf(message.payload)).catch(refusal)
    if (typeof caller === 'string') return push(reply(message, 'error', { reason: caller }))
    const parsed = parseBindings(config.postgres_changes, live, nextId)
    if (typeof parsed === 'string') return push(reply(message, 'error', { reason: parsed }))
    const channel: Channel = { joinRef: message.joinRef, caller, remove: () => {} }
    if (parsed.bindings.length > 0) {
      channel.remove = hub.add({ caller: () => channel.caller, bindings: parsed.bindings, send: (payload) => toChannel(message.topic, channel, 'postgres_changes', payload) })
    }
    channels.set(message.topic, channel)
    expireAt(message.topic, channel)
    push(reply(message, 'ok', { postgres_changes: parsed.replies }))
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

  const handle = async (message: PhoenixMessage) => {
    if (message.topic === 'phoenix') {
      if (message.event === 'heartbeat') push(reply(message, 'ok', {}))
      return
    }
    if (message.event === 'phx_join') return join(message)
    if (!channels.has(message.topic)) return push(reply(message, 'error', { reason: 'unmatched topic' }))
    if (message.event === 'access_token') return refresh(message)
    if (message.event === 'phx_leave') {
      leave(message.topic)
      push(reply(message, 'ok', {}))
      return push({ joinRef: message.joinRef, ref: message.ref, topic: message.topic, event: 'phx_close', payload: {} })
    }
    push(reply(message, 'error', { reason: `Not implemented: ${message.event}; this server has postgres_changes only` }))
  }

  const stayAwake = () => {
    clearTimeout(idle)
    idle = setTimeout(close, idleMs)
  }
  stayAwake()

  return {
    /** Handles a text frame after those before it. */
    message: (frame: string) => {
      stayAwake()
      const message = decodeMessage(vsn, frame)
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
