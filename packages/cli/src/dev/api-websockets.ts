import { createAdaptorServer } from '@hono/node-server'
import type { Hono } from 'hono'
import type { Plugin } from 'vite'
import { WebSocketServer } from 'ws'
import { isProjectFile } from './project-files'

// The API's WebSocket addresses; every other upgrade, such as Vite's HMR socket, stays Vite's.
export const isApiWebSocket = (url: string) => /^\/realtime\/v1\/websocket(\?|$)/.test(url)

// Service Restart: realtime-js reconnects, to the API the edit rebuilt.
const restartCode = 1012

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
      server.httpServer?.on('upgrade', (request, socket, head) => {
        if (isApiWebSocket(request.url ?? '')) upgrades.emit('upgrade', request, socket, head)
      })
      server.httpServer?.on('close', () => upgrades.emit('close'))
    },
    handleHotUpdate: ({ file }) => {
      if (isProjectFile(dirs, file)) wss.clients.forEach((client) => client.close(restartCode))
      return undefined
    },
  }
}
