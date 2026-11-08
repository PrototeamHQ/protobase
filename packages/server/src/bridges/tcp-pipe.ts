import type { Socket } from 'node:net'
import type { FunctionSocket, SocketEvents } from '../functions/function-socket'
import { bridgeClosings, type BridgeClosing } from './bridge-closings'

/** How long a connection waits for its socket to open before it is closed, as when the upgrade never happens. */
export const pipeOpenWithinMs = 10_000

/**
 * The socket events that pass bytes both ways between a function's WebSocket and an open TCP connection: each binary
 * message is written to the connection, and the next is read only once the connection took it; each chunk the
 * connection reads is sent, and the next is read only once the socket wrote it, so neither side buffers more than one
 * chunk. Either side closing closes the other; a text message closes the bridge with 1003. A connection whose socket
 * does not open within `pipeOpenWithinMs` is closed.
 */
export const tcpPipe = (tcp: Socket, { onOpen, onClose }: Pick<SocketEvents, 'onOpen' | 'onClose'> = {}): SocketEvents => {
  let socket: FunctionSocket | undefined
  // How the connection ended, kept from the start, so an end before the socket opened still closes it once it does.
  let ended: BridgeClosing | undefined
  const close = ({ code, reason }: BridgeClosing) => socket?.close(code, reason)
  const endWith = (closing: BridgeClosing) => {
    ended ??= closing
    close(ended)
  }
  tcp.pause()
  const unopened = setTimeout(() => tcp.destroy(), pipeOpenWithinMs)
  tcp.on('error', () => endWith(bridgeClosings.serviceFailed))
  tcp.on('close', () => endWith(bridgeClosings.serviceEnded))
  return {
    onOpen: async (opened) => {
      socket = opened
      clearTimeout(unopened)
      if (ended) return close(ended)
      tcp.on('data', (chunk: Buffer) => {
        tcp.pause()
        void opened.send(chunk).then(() => tcp.resume())
      })
      await onOpen?.(opened)
      tcp.resume()
    },
    onMessage: (data) => {
      if (typeof data === 'string') return close(bridgeClosings.textRefused)
      if (tcp.destroyed) return
      return new Promise<void>((resolve) => {
        if (tcp.write(new Uint8Array(data))) return resolve()
        const settle = () => {
          tcp.off('drain', settle).off('close', settle)
          resolve()
        }
        tcp.once('drain', settle).once('close', settle)
      })
    },
    onClose: async (code, reason) => {
      tcp.destroy()
      await onClose?.(code, reason)
    },
  }
}
