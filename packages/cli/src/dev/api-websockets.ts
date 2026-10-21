import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { createAdaptorServer } from '@hono/node-server'
import type { Hono } from 'hono'
import type { Plugin } from 'vite'
import { WebSocketServer } from 'ws'
import { isAllowedHost } from './allowed-host'
import { isProjectFile } from './project-files'

// The API's WebSocket addresses, realtime's and the app's functions'; every other upgrade, such as Vite's HMR socket,
// stays Vite's.
export const isApiWebSocket = (url: string) => /^\/api\/sb\/realtime\/v1\/websocket(\?|$)/.test(url) || /^\/api\/functions\/[^/?#]+(\/|\?|$)/.test(url)

// Service Restart: realtime-js and the app's own clients reconnect, to the API the edit rebuilt.
const restartCode = 1012

type Upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => void

/**
 * The listener for Vite's `upgrade` event: an API socket goes to `forward` once its Host passes Vite's host check, as
 * every other dev request does, and is refused with 403 otherwise; any other upgrade is left to Vite.
 */
export const apiUpgrades = (allowedHosts: () => true | readonly string[], forward: Upgrade): Upgrade => (request, socket, head) => {
  if (!isApiWebSocket(request.url ?? '')) return
  if (isAllowedHost(request.headers.host, allowedHosts())) return forward(request, socket, head)
  socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
}

// Upgrades the API's WebSockets on Vite's HTTP server, as `protobase serve` does on its own: each one goes to the entry
// module's app as it is now, whose `upgradeWebSocket` route accepts it. An edit inside `dirs` closes the open sockets,
// which hold the API they were opened with.
export const apiWebSockets = (entry: string, dirs: string[]): Plugin => {
  const wss = new WebSocketServer({ noServer: true })
  return {
    name: 'protobase-api-websockets',
    configureServer: (server) => {
      const upgrades = createAdaptorServer({
        fetch: async (request, env) => ((await server.ssrLoadModule(entry)).default as Hono).fetch(request, env),
        overrideGlobalObjects: false,
        websocket: { server: wss },
      })
      // The resolved hosts, read at each upgrade, include the ones Vite adds itself.
      server.httpServer?.on('upgrade', apiUpgrades(() => server.config.server.allowedHosts, (request, socket, head) => upgrades.emit('upgrade', request, socket, head)))
      server.httpServer?.on('close', () => upgrades.emit('close'))
    },
    handleHotUpdate: ({ file }) => {
      if (isProjectFile(dirs, file)) wss.clients.forEach((client) => client.close(restartCode))
      return undefined
    },
  }
}
