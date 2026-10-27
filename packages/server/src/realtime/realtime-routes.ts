import { Hono } from 'hono'
import type { UpgradeWebSocket } from 'hono/ws'
import type { Caller } from '../api-keys/resolve-caller'
import { HttpProblem } from '../problem'
import type { Entry } from '../registry'
import { broadcastApi } from './broadcast-api'
import { broadcastHub } from './broadcast-hub'
import { bufferedOf } from './buffered-amount'
import type { ChangeHub } from './change-hub'
import type { ChannelAccess } from './channel-access'
import { vsnOf } from './phoenix-message'
import { presenceHub } from './presence-hub'
import { realtimeSocket } from './realtime-socket'

export type RealtimeRoutesOptions = {
  /** The host's WebSocket upgrade: `@hono/node-server`'s, on a server of npm `ws`, which counts each socket's unsent bytes. */
  upgradeWebSocket: UpgradeWebSocket
  /** The caller of a request with the app's key in `apikey` and a token in its bearer (`apiKeyCaller`). */
  caller: (request: Request) => Promise<Caller>
  live: readonly Entry[]
  hub: ChangeHub
  access: ChannelAccess
  report: (error: unknown) => void
}

// The key and token as the headers the key resolver reads, since a WebSocket sends them in its URL and messages.
const keyRequest = (apikey: string, token?: string) => new Request('http://realtime.invalid/', { headers: { apikey, ...(token !== undefined && { authorization: `Bearer ${token}` }) } })

/**
 * `GET /api/sb/realtime/v1/websocket?apikey=…&vsn=…`: Supabase Realtime's socket, for `postgres_changes` of the live
 * resources, and broadcasts and presence between the sockets of this process (see `realtimeSocket`). A missing or wrong
 * key is refused before the upgrade, with 401. A socket whose raw socket is not one of npm `ws`, such as Bun's own `ws`
 * shim's, is closed at once with 1011, since its unsent bytes cannot be counted (`realtimeLimits.maxUnsentBytes`).
 * `POST /api/sb/realtime/v1/api/broadcast` sends to the same channels without a socket (see `broadcastApi`).
 */
export const realtimeRoutes = ({ upgradeWebSocket, caller, live, hub, access, report }: RealtimeRoutesOptions) => {
  const app = new Hono()
  const broadcasts = broadcastHub()
  const presences = presenceHub()
  let lastId = 0
  const nextId = () => ++lastId
  app.route('/api/broadcast', broadcastApi({ caller, broadcasts, access, report }))
  app.get(
    '/websocket',
    async (c, next) => {
      const vsn = vsnOf(c.req.query('vsn'))
      if (!vsn) throw new HttpProblem(400, 'invalid-request', 'Bad Request', 'Use vsn 1.0.0 or 2.0.0')
      await caller(keyRequest(c.req.query('apikey') ?? ''))
      await next()
    },
    upgradeWebSocket((c) => {
      const apikey = c.req.query('apikey')!
      let socket: ReturnType<typeof realtimeSocket> | undefined
      return {
        onOpen: (_event, ws) => {
          if (bufferedOf(ws.raw) === undefined) {
            report(new Error('Not implemented: realtime needs WebSockets of npm ws, which count unsent bytes; on Bun, load npm ws by its path rather than Bun\'s ws shim, or run on Node'))
            return ws.close(1011)
          }
          socket = realtimeSocket({
            vsn: vsnOf(c.req.query('vsn'))!,
            send: (frame) => ws.send(frame),
            buffered: () => bufferedOf(ws.raw)!,
            close: (code) => ws.close(code),
            resolve: (token) => caller(keyRequest(apikey, token)),
            live,
            hub,
            broadcasts,
            presences,
            access,
            nextId,
            report,
          })
        },
        onMessage: (event) => socket?.message(event.data),
        // ws closes a socket itself on a protocol error, such as a frame over its `maxPayload`, and its close event can
        // come 30 seconds later, when the client does not answer: the socket leaves at the error.
        onError: () => socket?.closed(),
        onClose: () => socket?.closed(),
      }
    }),
  )
  return app
}
