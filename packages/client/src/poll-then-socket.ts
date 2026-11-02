import type { SocketLike } from './channel-connection'

/** The part of a WebSocket `pollThenSocket` uses: the browser's and Node's global `WebSocket` both have it. */
export type LiveSocket = Pick<SocketLike, 'close' | 'onopen' | 'onmessage' | 'onclose'>

export type PollThenSocketOptions = {
  /**
   * Reads what changed. Called at once, then `pollMs` after each read ends for as long as no socket is open, and once
   * more as a socket opens, for what changed before it did. A read that rejects is the caller's to handle: the next
   * read still comes.
   */
  poll: () => Promise<void>
  /** Opens the WebSocket, such as `() => new WebSocket(url)`. */
  socket: () => LiveSocket
  /** The data of each message the open socket receives. */
  onMessage: (data: unknown) => void
  /** How long after a read ends the next one starts while it polls; 5 seconds by default. */
  pollMs?: number
  /** How long it polls before it opens the socket, and before it tries again after the socket closed or failed to open; 30 seconds by default. */
  switchAfterMs?: number
  /** Opens the socket at once instead of polling first. */
  socketFirst?: boolean
}

/**
 * Keeps up with something that changes, until the returned function is called: it polls first, and opens a WebSocket
 * after `switchAfterMs`, which takes over once it is open, so a short visit costs no socket. When the socket closes, or
 * never opens, it polls again at once and tries the socket again `switchAfterMs` later. Polling goes on until a socket
 * is open, so nothing waits on a socket still connecting.
 */
export const pollThenSocket = ({ poll, socket: openSocket, onMessage, pollMs = 5_000, switchAfterMs = 30_000, socketFirst = false }: PollThenSocketOptions) => {
  let stopped = false
  let socket: LiveSocket | undefined
  let socketOpen = false
  let reading = false
  let readAgain = false
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let switchTimer: ReturnType<typeof setTimeout> | undefined

  // One read at a time: a read asked for during one starts as soon as it ends.
  const read = () => {
    clearTimeout(pollTimer)
    pollTimer = undefined
    if (stopped) return
    if (reading) {
      readAgain = true
      return
    }
    reading = true
    void poll().finally(() => {
      reading = false
      if (stopped) return
      if (readAgain) {
        readAgain = false
        read()
        return
      }
      if (!socketOpen) pollTimer = setTimeout(read, pollMs)
    })
  }

  const connect = () => {
    switchTimer = undefined
    if (stopped) return
    const current = openSocket()
    socket = current
    current.onopen = () => {
      if (socket !== current) return
      socketOpen = true
      read()
    }
    current.onmessage = (event) => {
      if (socket === current) onMessage(event.data)
    }
    current.onclose = () => {
      if (socket !== current) return
      socket = undefined
      socketOpen = false
      read()
      switchTimer = setTimeout(connect, switchAfterMs)
    }
  }

  if (socketFirst) connect()
  else {
    read()
    switchTimer = setTimeout(connect, switchAfterMs)
  }

  return () => {
    stopped = true
    clearTimeout(pollTimer)
    clearTimeout(switchTimer)
    const current = socket
    socket = undefined
    current?.close()
  }
}
