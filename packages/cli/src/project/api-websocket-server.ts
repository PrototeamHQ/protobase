import { createRequire } from 'node:module'
import path from 'node:path'
import { honorSocketMessageCaps, realtimeLimits, socketMessageCapOf } from '@protobase/server'
import { WebSocketServer } from 'ws'

const require = createRequire(import.meta.url)

// Bun answers `ws` with a shim of its own, which ignores `maxPayload` and counts no unsent bytes, so realtime refuses its
// sockets; a bundle that inlined npm ws, as `protobase build-serve`'s does, has the real one. Loaded by its path, npm ws
// is the real one on Bun too.
const npmWebSocketServer = (): typeof WebSocketServer => {
  if (process.versions.bun === undefined || WebSocketServer !== require('ws').WebSocketServer) return WebSocketServer
  return require(path.join(path.dirname(require.resolve('ws/package.json')), 'index.js')).WebSocketServer
}

const functionsPrefix = '/api/functions/'
// ws's own default, which function sockets had before realtime's cap.
const functionMaxPayload = 100 * 1024 * 1024

/**
 * The frame cap of a socket upgraded at `url`: ws's default for an api function's socket, and realtime's
 * `maxFrameBytes` for any other, so a path this does not recognise as a function's, such as an encoded one, gets the
 * smaller cap.
 */
export const maxPayloadOf = (url: string) => {
  if (!URL.canParse(url, 'http://localhost')) return realtimeLimits.maxFrameBytes
  return new URL(url, 'http://localhost').pathname.startsWith(functionsPrefix) ? functionMaxPayload : realtimeLimits.maxFrameBytes
}

/**
 * The server of npm `ws` that upgrades the API's sockets, realtime's and the app's functions', on Node and Bun: a frame
 * over its socket's cap (`maxPayloadOf`, or a function's lower `maxMessageBytes`) closes the socket with 1009 before it
 * is read.
 */
export const apiWebSocketServer = () => {
  const Base = npmWebSocketServer()
  class ApiWebSocketServer extends Base {
    override handleUpgrade(...[request, ...rest]: Parameters<WebSocketServer['handleUpgrade']>) {
      // Without `verifyClient`, ws 8.22.0 reads `options.maxPayload` synchronously from here to the socket's
      // `setSocket` (lib/websocket-server.js, `handleUpgrade` to `completeUpgrade`), so each upgrade sets its own. A
      // function's `maxMessageBytes`, marked on its request, can only lower it.
      this.options.maxPayload = Math.min(maxPayloadOf(request.url ?? ''), socketMessageCapOf(request) ?? Infinity)
      super.handleUpgrade(request, ...rest)
    }
  }
  const server = new ApiWebSocketServer({ noServer: true, maxPayload: realtimeLimits.maxFrameBytes })
  honorSocketMessageCaps(server)
  return server
}
