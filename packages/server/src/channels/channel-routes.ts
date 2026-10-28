import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { UpgradeWebSocket } from 'hono/ws'
import type { Deps } from '../deps'
import { HttpProblem, notFound } from '../problem'
import { bufferedOf } from '../realtime/buffered-amount'
import type { RealtimeHubs } from '../realtime/realtime-hubs'
import { realtimeLimits } from '../realtime/realtime-limits'
import type { ErrorHandler } from 'hono'
import type { AdminEnv, Authenticator, Session } from '../types'
import { channelRecord } from './channel-name'
import { broadcastRecord, publishTo } from './channel-sender'
import { channelSocket } from './channel-socket'
import { recordReadable } from './record-readable'

export type ChannelRoutesOptions = {
  deps: Deps
  /** The host's WebSocket upgrade: `@hono/node-server`'s, on a server of npm `ws`, which counts each socket's unsent bytes. */
  upgradeWebSocket: UpgradeWebSocket
  /** The caller of a request, a visitor too when the app has an anonymous role. */
  authenticate: Authenticator
  /** The caller of an upgrade, which a browser opens with its cookie (`upgradeAuthenticator`), a visitor likewise. */
  authenticateUpgrade: Authenticator
  onError: ErrorHandler
  hubs: RealtimeHubs['records']
  /** Reads the other processes' broadcasts and presences while a socket is open (`RealtimeHubs['follow']`). */
  follow: () => () => void
  report: (error: unknown) => void
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The subprotocol `@protobase/client` opens a socket with, and the one the server answers with. */
export const channelProtocol = 'protobase.channels'

// A browser cannot set headers on a WebSocket, so a client with a bearer token offers it as a second subprotocol,
// `bearer.<token>`, beside `channelProtocol`, which the server picks as the first one offered.
const bearerOf = (request: Request) =>
  request.headers.get('sec-websocket-protocol')?.split(',').map((part) => part.trim()).find((part) => part.startsWith('bearer.'))?.slice('bearer.'.length)

// The request with the token as its bearer, unless it has a bearer of its own or there is none.
const withBearer = (request: Request, token: string | undefined) => {
  if (token === undefined || request.headers.has('authorization')) return request
  const headers = new Headers(request.headers)
  headers.set('authorization', `Bearer ${token}`)
  return new Request(request, { headers })
}

const invalidBody = () => new HttpProblem(422, 'invalid-broadcast', 'Unprocessable Content', 'Send { "event": "…", "payload": … } as application/json')

/**
 * `GET /channels`, a WebSocket of channels named by records (see `channelSocket`), refused before the upgrade like
 * any request its caller cannot make. `POST /channels/:resource/:key/broadcast` sends one broadcast without a socket,
 * as the caller, when they may read the record.
 */
export const channelRoutes = ({ deps, upgradeWebSocket, authenticate, authenticateUpgrade, onError, hubs, follow, report }: ChannelRoutesOptions) => {
  const app = new Hono<AdminEnv>()
  app.onError(onError)
  const readable = (session: Session, record: Parameters<typeof recordReadable>[2]) => recordReadable(deps, session, record)

  app.get(
    '/channels',
    async (c, next) => {
      c.set('session', await authenticateUpgrade(withBearer(c.req.raw, bearerOf(c.req.raw))))
      await next()
    },
    upgradeWebSocket((c) => {
      const request = c.req.raw
      const opened = bearerOf(request)
      let socket: ReturnType<typeof channelSocket> | undefined
      let unfollow = () => {}
      // The channels leave first, so that with several processes their presences' leaves are written before the relay stops.
      const closed = () => {
        socket?.closed()
        unfollow()
      }
      return {
        onOpen: (_event, ws) => {
          if (bufferedOf(ws.raw) === undefined) {
            report(new Error('Not implemented: channels need WebSockets of npm ws, which count unsent bytes; on Bun, load npm ws by its path rather than Bun\'s ws shim, or run on Node'))
            return ws.close(1011)
          }
          unfollow = follow()
          socket = channelSocket({
            send: (frame) => ws.send(frame),
            buffered: () => bufferedOf(ws.raw)!,
            close: (code) => ws.close(code),
            session: c.get('session'),
            reauthenticate: async (token) => authenticateUpgrade(withBearer(request, token ?? opened)),
            record: (resource, key) => channelRecord(deps.registry, resource, key),
            readable,
            broadcasts: hubs.broadcasts,
            presences: hubs.presences,
            report,
          })
        },
        onMessage: (event) => socket?.message(event.data),
        onError: closed,
        onClose: closed,
      }
    }),
  )

  app.post(
    '/channels/:resource/:key/broadcast',
    async (c, next) => {
      c.set('session', await authenticate(c.req.raw))
      await next()
    },
    bodyLimit({ maxSize: realtimeLimits.maxFrameBytes, onError: () => { throw new HttpProblem(413, 'too-large', 'Payload Too Large', `A broadcast request is at most ${realtimeLimits.maxFrameBytes} bytes`) } }),
    async (c) => {
      const body = await c.req.json<unknown>().catch((error: unknown) => {
        if (error instanceof SyntaxError) throw invalidBody()
        throw error
      })
      if (!isRecord(body) || typeof body.event !== 'string' || !('payload' in body)) throw invalidBody()
      const message = { resource: c.req.param('resource'), key: c.req.param('key'), event: body.event, payload: body.payload }
      const record = broadcastRecord(deps.registry, message)
      const session = c.get('session')
      if (!(await recordReadable(deps, session, record))) throw notFound('There is no such record')
      await publishTo(hubs.broadcasts, record, message.event, { user: session.anonymous ? null : session.user.id, payload: message.payload })
      return c.body(null, 202)
    },
  )
  return app
}
