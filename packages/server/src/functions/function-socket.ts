import type { WSEvents } from 'hono/ws'
import { recheckWhileOpen } from './socket-recheck'

/** An open WebSocket as a function sees it. */
export type FunctionSocket = {
  /** Resolves once the data is written to the connection, or at once when the socket is closed; it never rejects. */
  send(data: string | ArrayBuffer | Uint8Array): Promise<void>
  close(code?: number, reason?: string): void
  /** The bytes queued to send but not yet written. */
  readonly bufferedAmount: number
}

/** What a function's socket does: see `acceptWebSocket`. */
export type SocketEvents = {
  onOpen?: (socket: FunctionSocket) => void | Promise<void>
  /** Text arrives as a string, binary as an ArrayBuffer. The next message waits until a returned promise settles. */
  onMessage?: (data: string | ArrayBuffer, socket: FunctionSocket) => void | Promise<void>
  onClose?: (code: number, reason: string) => void | Promise<void>
}

/** What both `ws` and Bun's built-in `ws` socket have; only the first can pause reading. */
export type RawSocket = {
  send(data: string | ArrayBuffer | Uint8Array, callback: (error?: Error) => void): void
  close(code?: number, reason?: string): void
  readonly bufferedAmount: number
  readonly readyState: number
  pause?: () => void
  resume?: () => void
}

export type SocketEventsOptions = {
  report: (error: unknown) => void
  /** Checked again every minute while the socket is open (see `recheckWhileOpen`). */
  recheck?: () => Promise<unknown>
}

const openState = 1
/** Received bytes waiting for `onMessage` above which reading pauses. */
export const pauseAboveBytes = 1 << 20
/** Where reading cannot pause, the waiting bytes above which the socket closes with 1013 (Try Again Later). */
export const closeAboveBytes = 16 << 20

const sizeOf = (data: string | ArrayBuffer) => (typeof data === 'string' ? data.length : data.byteLength)

/**
 * A function's socket events as Hono's, over the host's raw socket. Messages reach `onMessage` one at a time, in order,
 * after `onOpen`, and `onClose` comes after the last of them. A handler that throws or rejects is reported and closes
 * the socket with 1011.
 */
export const socketEvents = (events: SocketEvents, { report, recheck }: SocketEventsOptions): WSEvents => {
  let raw: RawSocket
  let socket: FunctionSocket
  let chain: Promise<unknown> = Promise.resolve()
  let waiting = 0
  let paused = false
  let ended = false
  let stopRecheck = () => {}
  const end = (code: number, reason: string) => {
    ended = true
    stopRecheck()
    raw.close(code, reason)
  }
  const fail = (error: unknown) => {
    report(error)
    if (!ended) end(1011, 'Internal Error')
  }
  // Each step after the one before; once the socket failed or was refused, only `onClose` still runs.
  const enqueue = (step: () => unknown, always = false) => {
    chain = chain.then(() => (ended && !always ? undefined : step())).catch(fail)
  }
  const received = (data: string | ArrayBuffer) => {
    const size = sizeOf(data)
    waiting += size
    if (waiting > pauseAboveBytes && raw.pause && !paused) {
      paused = true
      raw.pause()
    }
    if (waiting > closeAboveBytes && !raw.pause && !ended) end(1013, 'Try Again Later')
    enqueue(async () => {
      await events.onMessage?.(data, socket)
      waiting -= size
      if (paused && waiting === 0) {
        paused = false
        raw.resume?.()
      }
    })
  }

  return {
    onOpen: (_event, ws) => {
      raw = ws.raw as RawSocket
      socket = {
        send: (data) =>
          new Promise((resolve) => {
            if (raw.readyState !== openState) return resolve()
            raw.send(data, () => resolve())
          }),
        close: (code, reason) => raw.close(code, reason),
        get bufferedAmount() {
          return raw.bufferedAmount
        },
      }
      if (recheck) stopRecheck = recheckWhileOpen({ check: recheck, close: end, report })
      enqueue(() => events.onOpen?.(socket))
    },
    onMessage: (event) => {
      if (typeof event.data === 'string' || event.data instanceof ArrayBuffer) received(event.data)
    },
    onClose: (event) => {
      stopRecheck()
      enqueue(() => events.onClose?.(event.code, event.reason), true)
    },
  }
}
