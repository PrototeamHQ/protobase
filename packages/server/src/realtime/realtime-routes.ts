import { Hono } from 'hono'
import type { UpgradeWebSocket } from 'hono/ws'
import type { Caller } from '../api-keys/resolve-caller'
import { HttpProblem } from '../problem'
import type { Entry } from '../registry'
import { broadcastHub } from './broadcast-hub'
import type { ChangeHub } from './change-hub'
import { vsnOf } from './phoenix-message'
import { presenceHub } from './presence-hub'
import { realtimeSocket } from './realtime-socket'

export type RealtimeRoutesOptions = {
  /** The host's WebSocket upgrade, such as `@hono/node-server`'s. */
  upgradeWebSocket: UpgradeWebSocket
  /** The caller of a request with the app's key in `apikey` and a token in its bearer (`apiKeyCaller`). */
  caller: (request: Request) => Promise<Caller>
  live: readonly Entry[]
  hub: ChangeHub
  report: (error: unknown) => void
}

// The key and token as the headers the key resolver reads, since a WebSocket sends them in its URL and messages.
const keyRequest = (apikey: string, token?: string) => new Request('http://realtime.invalid/', { headers: { apikey, ...(token !== undefined && { authorization: `Bearer ${token}` }) } })

/**
 * `GET /realtime/v1/websocket?apikey=…&vsn=…`: Supabase Realtime's socket, for `postgres_changes` of the live
 * resources, and broadcasts and presence between the sockets of this process (see `realtimeSocket`). A missing or wrong
 * key is refused before the upgrade, with 401.
 */
export const realtimeRoutes = ({ upgradeWebSocket, caller, live, hub, report }: RealtimeRoutesOptions) => {
  const app = new Hono()
  const broadcasts = broadcastHub()
  const presences = presenceHub()
  let lastId = 0
  const nextId = () => ++lastId
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
          socket = realtimeSocket({
            vsn: vsnOf(c.req.query('vsn'))!,
            send: (frame) => ws.send(frame),
            close: () => ws.close(),
            resolve: (token) => caller(keyRequest(apikey, token)),
            live,
            hub,
            broadcasts,
            presences,
            nextId,
            report,
          })
        },
        onMessage: (event) => {
          if (typeof event.data === 'string' || event.data instanceof ArrayBuffer) socket?.message(event.data)
        },
        onClose: () => socket?.closed(),
      }
    }),
  )
  return app
}
