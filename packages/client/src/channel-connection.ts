import { decodeBinaryFrame, encodeBinaryFrame } from './channel-binary-frame'
import { ChannelRefusal, type ServerMessage } from './channel-types'

/** The part of the browser's `WebSocket` a connection uses, which a test hands its own of. */
export type SocketLike = {
  readonly readyState: number
  binaryType: string
  send(data: string | ArrayBuffer): void
  close(code?: number): void
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: unknown) => void) | null
}

export type ConnectionOptions = {
  /** The socket's `ws:` or `wss:` URL of `/api/channels`, read as it connects. */
  url: () => string
  /** The bearer token, when the client has one: offered as a subprotocol on opening, and handed over as it changes. */
  token?: () => Promise<string | undefined>
  socket: (url: string, protocols: string[]) => SocketLike
  /** How long to wait before connecting again after the `attempt`th failure in a row. */
  retryDelay: (attempt: number) => number
  /** The socket opened: join the channels again. */
  onOpen: () => void
  /** The socket dropped; it connects again by itself. */
  onDown: () => void
  onMessage: (message: ServerMessage) => void
}

/** How often the client pings, the server's `channelBounds.pingMs`; no pong in twice that drops the connection. */
export const pingMs = 5_000

const openState = 1
const protocol = 'protobase.channels'

type Pending = { resolve: (reply: Extract<ServerMessage, { type: 'reply'; ok: true }>) => void; reject: (error: unknown) => void }

/**
 * The one socket of a client's channels: opened on `start`, connected again after a pause that grows with each failure
 * while it is wanted, closed on `stop`. It pings every `pingMs`, hands the server a token that changed, and drops a
 * socket that answered no ping in twice that, as one whose network went away.
 */
export const channelConnection = ({ url, token, socket: open, retryDelay, onOpen, onDown, onMessage }: ConnectionOptions) => {
  let socket: SocketLike | undefined
  let wanted = false
  let failures = 0
  let lastRef = 0
  let sentToken: string | undefined
  let heardAt = 0
  let ping: ReturnType<typeof setInterval> | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  const pending = new Map<string, Pending>()

  const dropPending = () => {
    for (const { reject } of pending.values()) reject(new ChannelRefusal('disconnected', 'The connection dropped before the server answered'))
    pending.clear()
  }

  const handover = async (current: SocketLike) => {
    const fresh = await token?.()
    if (socket !== current || current.readyState !== openState || fresh === undefined || fresh === sentToken) return
    sentToken = fresh
    current.send(JSON.stringify({ type: 'token', token: fresh }))
  }

  const connect = async () => {
    const offered = await token?.()
    if (!wanted || socket) return
    sentToken = offered
    const current = open(url(), offered === undefined ? [protocol] : [protocol, `bearer.${offered}`])
    socket = current
    current.binaryType = 'arraybuffer'
    current.onopen = () => {
      failures = 0
      heardAt = Date.now()
      ping = setInterval(() => {
        if (Date.now() - heardAt > 2 * pingMs) return current.close()
        current.send(JSON.stringify({ type: 'ping' }))
        void handover(current)
      }, pingMs)
      onOpen()
    }
    current.onmessage = ({ data }) => {
      heardAt = Date.now()
      if (typeof data !== 'string' && !(data instanceof ArrayBuffer)) return
      const message = (typeof data === 'string' ? JSON.parse(data) : decodeBinaryFrame(data)) as ServerMessage
      if (message.type !== 'reply') return onMessage(message)
      const waiting = pending.get(message.ref)
      pending.delete(message.ref)
      if (message.ok) waiting?.resolve(message)
      else waiting?.reject(new ChannelRefusal(message.error.code, message.error.message))
    }
    current.onclose = () => {
      if (socket !== current) return
      clearInterval(ping)
      socket = undefined
      dropPending()
      if (!wanted) return
      onDown()
      retry = setTimeout(() => {
        retry = undefined
        void connect()
      }, retryDelay(failures++))
    }
  }

  // With bytes, a binary frame of the message and them as its payload.
  const sendNow = (message: Record<string, unknown>, bytes?: ArrayBuffer | ArrayBufferView) => {
    if (socket?.readyState !== openState) return false
    socket.send(bytes === undefined ? JSON.stringify(message) : encodeBinaryFrame(message, bytes))
    return true
  }

  return {
    /** Opens the socket, unless it is open or opening. */
    start: () => {
      wanted = true
      if (!socket && retry === undefined) void connect()
    },
    /** Closes the socket for good, until the next `start`. */
    stop: () => {
      wanted = false
      clearTimeout(retry)
      retry = undefined
      clearInterval(ping)
      const current = socket
      socket = undefined
      dropPending()
      current?.close(1000)
    },
    /** Sends a message with a ref, and bytes as its payload if any, and resolves with its reply, or rejects with its refusal. */
    request: (message: Record<string, unknown>, bytes?: ArrayBuffer | ArrayBufferView) =>
      new Promise<Extract<ServerMessage, { type: 'reply'; ok: true }>>((resolve, reject) => {
        const ref = String(++lastRef)
        if (!sendNow({ ...message, ref }, bytes)) return reject(new ChannelRefusal('disconnected', 'The connection is down'))
        pending.set(ref, { resolve, reject })
      }),
    /** Sends a message that gets no reply, and bytes as its payload if any; `false` when the socket is not open. */
    post: sendNow,
  }
}

export type ChannelConnection = ReturnType<typeof channelConnection>
