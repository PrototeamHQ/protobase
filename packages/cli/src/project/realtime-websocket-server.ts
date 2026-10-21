import { createRequire } from 'node:module'
import path from 'node:path'
import { realtimeLimits } from '@protobase/server'
import { WebSocketServer } from 'ws'

const require = createRequire(import.meta.url)

// Bun answers `ws` with a shim of its own, which ignores `maxPayload` and counts no unsent bytes, so realtime refuses its
// sockets; a bundle that inlined npm ws, as `protobase build-serve`'s does, has the real one. Loaded by its path, npm ws
// is the real one on Bun too.
const npmWebSocketServer = (): typeof WebSocketServer => {
  if (process.versions.bun === undefined || WebSocketServer !== require('ws').WebSocketServer) return WebSocketServer
  return require(path.join(path.dirname(require.resolve('ws/package.json')), 'index.js')).WebSocketServer
}

/**
 * The server of npm `ws` that upgrades `/api/sb/realtime/v1` sockets, on Node and Bun: a frame over
 * `realtimeLimits.maxFrameBytes` closes its socket with 1009 before it is read.
 */
export const realtimeWebSocketServer = () => new (npmWebSocketServer())({ noServer: true, maxPayload: realtimeLimits.maxFrameBytes })
