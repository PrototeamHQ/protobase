import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { isAllowedHost } from './allowed-host'

// The API's WebSocket addresses, realtime's, the record channels' and the app's functions'; every other upgrade, such as
// Vite's HMR socket, stays Vite's.
export const isApiWebSocket = (url: string) =>
  /^\/api\/sb\/realtime\/v1\/websocket(\?|$)/.test(url) || /^\/api\/channels(\?|$)/.test(url) || /^\/api\/functions\/[^/?#]+(\/|\?|$)/.test(url)

export type Upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => void

/**
 * The listener for Vite's `upgrade` event: an API socket goes to `forward` once its Host passes Vite's host check, as
 * every other dev request does, and is refused with 403 otherwise; any other upgrade is left to Vite.
 */
export const apiUpgrades = (allowedHosts: () => true | readonly string[], forward: Upgrade): Upgrade => (request, socket, head) => {
  if (!isApiWebSocket(request.url ?? '')) return
  if (isAllowedHost(request.headers.host, allowedHosts())) return forward(request, socket, head)
  socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
}
