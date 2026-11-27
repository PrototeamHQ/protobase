import type { SocketLike } from '../channel-connection'
import { decodeFrame, encodeFrame, replyOf, type Frame } from './phoenix-frame'
import { RelayRefusal } from './relay-types'

/** What `POST /api/relay/ticket` answers: a ticket that connects once, the relay's socket address and the channels it lists. */
export type RelayTicket = { ticket: string; url: string; channels: string[] }

/** The part of a WebSocket the relay's connection uses. */
export type RelaySocketLike = Pick<SocketLike, 'readyState' | 'send' | 'close' | 'onopen' | 'onmessage' | 'onclose'>

export type RelaySocketOptions = {
  /** A fresh ticket, asked for on every connect: each one connects once. */
  ticket: () => Promise<RelayTicket>
  /** Opens a WebSocket. */
  socket: (url: string) => RelaySocketLike
  /** Opens a server-sent event connection (`sseSocket`), for a network where a WebSocket never opens. */
  events: (url: string) => RelaySocketLike
  /** How long a WebSocket may take to open before the connection goes over server-sent events instead; 2.5 seconds by default. */
  fallbackMs?: number
  /** How long to wait before connecting again after the `attempt`th failure in a row. */
  retryDelay: (attempt: number) => number
  /** Whether a ticket's refusal ends the connection rather than being tried again, such as for a session that ended. */
  final: (error: unknown) => boolean
  /** The socket opened with the ticket's channels; `again` after it had been open before. */
  onOpen: (channels: readonly string[], again: boolean) => void
  /** The socket dropped; it connects again by itself with a fresh ticket. */
  onDown: () => void
  /** The app refused a ticket for good, or the relay closed the connection for good. */
  onEnded: (error: unknown) => void
  /** Each frame that is no reply. */
  onFrame: (frame: Frame) => void
}

/** How often the socket sends a heartbeat; one still unanswered at the next drops the socket, as one whose network went away. */
export const heartbeatMs = 30_000

const openState = 1

/** The close code a relay ends a connection with for good, such as for a session the app closed or an app it no longer serves. */
const finalCode = 1000

const codeOf = (event: unknown) => (event as { code?: unknown } | undefined)?.code

/** The socket's address with its ticket, in the Phoenix V2 shape. */
export const socketAddress = (url: string, ticket: string) => `${url.replace(/\/+$/, '')}/websocket?vsn=2.0.0&ticket=${encodeURIComponent(ticket)}`

/** The server-sent event stream's address with its ticket: the endpoint's `/sse`, over HTTP. */
export const eventsAddress = (url: string, ticket: string) => `${url.replace(/\/+$/, '').replace(/^ws/, 'http')}/sse?vsn=2.0.0&ticket=${encodeURIComponent(ticket)}`

type Pending = { resolve: () => void; reject: (error: unknown) => void }

/**
 * The one socket to the relay: opened on `start` with a fresh ticket, connected again with another after a pause that
 * grows with each failure while it is wanted, closed on `stop`. A socket the relay closes, for any reason, is connected
 * again the same way, so a ticket listing channels the person joined since is taken up; one it closes with 1000 is
 * closed for good, as by `stop`.
 *
 * It tries a WebSocket first. When that closes before it opened, or does not open within `fallbackMs`, and no
 * WebSocket opened before, the network blocks them: it connects again at once over server-sent events, and stays on
 * them until the page loads again.
 */
export const relaySocket = ({ ticket, socket: open, events, fallbackMs = 2_500, retryDelay, final, onOpen, onDown, onEnded, onFrame }: RelaySocketOptions) => {
  let socket: RelaySocketLike | undefined
  let wanted = false
  let connecting = false
  let wasOpen = false
  let failures = 0
  let overEvents = false
  let websocketOpened = false
  let lastRef = 0
  let heartbeat: string | undefined
  let beat: ReturnType<typeof setInterval> | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  let upgrade: ReturnType<typeof setTimeout> | undefined
  const pending = new Map<string, Pending>()

  const dropPending = () => {
    for (const { reject } of pending.values()) reject(new RelayRefusal('disconnected'))
    pending.clear()
  }

  const later = () => {
    retry = setTimeout(() => {
      retry = undefined
      void connect()
    }, retryDelay(failures++))
  }

  const sendFrame = (current: RelaySocketLike, topic: string, event: string, payload: Record<string, unknown>, joinRef: string | null) => {
    const ref = String(++lastRef)
    current.send(encodeFrame({ joinRef, ref, topic, event, payload }))
    return ref
  }

  const connect = async () => {
    if (!wanted || socket || connecting) return
    connecting = true
    const got = await ticket().then((answer) => ({ answer }), (error: unknown) => ({ error }))
    connecting = false
    if (!wanted || socket) return
    if ('error' in got) {
      if (!final(got.error)) return later()
      wanted = false
      return onEnded(got.error)
    }
    const websocket = !overEvents
    const current = websocket ? open(socketAddress(got.answer.url, got.answer.ticket)) : events(eventsAddress(got.answer.url, got.answer.ticket))
    socket = current
    let opened = false
    if (websocket) upgrade = setTimeout(() => current.close(), fallbackMs)
    current.onopen = () => {
      clearTimeout(upgrade)
      opened = true
      if (websocket) websocketOpened = true
      failures = 0
      heartbeat = undefined
      beat = setInterval(() => {
        if (heartbeat !== undefined) return current.close()
        heartbeat = sendFrame(current, 'phoenix', 'heartbeat', {}, null)
      }, heartbeatMs)
      const again = wasOpen
      wasOpen = true
      onOpen(got.answer.channels, again)
    }
    current.onmessage = ({ data }) => {
      if (typeof data !== 'string') return
      const frame = decodeFrame(data)
      if (!frame) return
      if (frame.event !== 'phx_reply') return onFrame(frame)
      if (frame.ref === heartbeat) heartbeat = undefined
      const waiting = frame.ref === null ? undefined : pending.get(frame.ref)
      if (!waiting) return
      pending.delete(frame.ref!)
      const reply = replyOf(frame.payload)
      if (reply.ok) waiting.resolve()
      else waiting.reject(new RelayRefusal(reply.reason))
    }
    current.onclose = (event) => {
      if (socket !== current) return
      clearInterval(beat)
      clearTimeout(upgrade)
      socket = undefined
      dropPending()
      if (!wanted) return
      if (codeOf(event) === finalCode) {
        wanted = false
        wasOpen = false
        return onEnded(new RelayRefusal('closed'))
      }
      if (websocket && !opened && !websocketOpened) {
        overEvents = true
        return void connect()
      }
      onDown()
      later()
    }
  }

  return {
    /** Opens the socket, unless it is open or opening. */
    start: () => {
      wanted = true
      if (retry === undefined) void connect()
    },
    /** Closes the socket for good, until the next `start`. */
    stop: () => {
      wanted = false
      wasOpen = false
      clearTimeout(retry)
      retry = undefined
      clearInterval(beat)
      clearTimeout(upgrade)
      const current = socket
      socket = undefined
      dropPending()
      current?.close(1000)
    },
    /**
     * Connects at once instead of waiting out the pause before the next try, such as when the page shows again or the
     * device is back online; nothing while the socket is open or connecting.
     */
    wake: () => {
      if (!wanted || retry === undefined) return
      clearTimeout(retry)
      retry = undefined
      failures = 0
      void connect()
    },
    /** Sends an event on a topic and resolves once the relay answered `ok`, or rejects with its `RelayRefusal`. */
    request: (topic: string, event: string, payload: Record<string, unknown>, joinRef: string | null = null) =>
      new Promise<void>((resolve, reject) => {
        if (socket?.readyState !== openState) return reject(new RelayRefusal('disconnected'))
        pending.set(sendFrame(socket, topic, event, payload, joinRef), { resolve, reject })
      }),
  }
}
