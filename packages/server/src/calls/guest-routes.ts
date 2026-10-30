import { Hono, type Context, type ErrorHandler } from 'hono'
import type { UpgradeWebSocket } from 'hono/ws'
import { socketAcceptor } from '../functions/accept-socket'
import { allowedOrigin } from '../functions/upgrade-caller'
import { forbidden, HttpProblem, notFound, unauthorized } from '../problem'
import type { CallsService } from './calls-service-type'
import { guestLimits } from './guest-limits'
import { guestName } from './guest-name'
import { guestSocket } from './guest-socket'
import { guestTokenPrefix, linkTokenPrefix, newToken, tokenHash } from './guest-tokens'

export type GuestRoutesInput = {
  calls: CallsService
  /** The address a request comes from, as the sign-in routes' rate limits take it; `null` when none can be trusted. */
  addressOf: (request: Request) => string | null
  /** The origins the app is served on, which alone may open a guest's socket. */
  origins?: readonly string[]
  upgradeWebSocket?: UpgradeWebSocket
  onError: ErrorHandler
  report: (error: unknown) => void
}

// Each answer is one guest's wait: no cache may keep it.
const noStore = { 'Cache-Control': 'no-store' }
const tooMany = () => new HttpProblem(429, 'too-many-requests', 'Too Many Requests', 'Too many tries: wait a minute', {}, { 'retry-after': '60' })
// One answer for every link that lets nobody in, so a link cannot be told apart from one that never was.
const noLobby = () => notFound('This link lets nobody into a call')

const bearer = (c: Context) => c.req.header('authorization')?.match(/^Bearer (.+)$/)?.[1]

/**
 * The guests' routes, mounted at `guestCallsPath` before the API's authenticator, which takes none of their tokens,
 * as no route but these takes them:
 * - `POST /lobby` with `{ link, name }`: the guest waits in the lobby of the link's call; `201 { guest, token }`.
 * - `GET /lobby` with `Authorization: Bearer <token>`: `{ state }`, with `call` and `publish` once let in.
 * - `DELETE /lobby`: the waiting guest leaves.
 * - `GET /socket`: the guest's call socket (see `guestSocket`).
 * Each address may enter `entriesPerMinute` times a minute, and is answered 429 for the rest of the minute after
 * `refusalsPerMinute` unknown or refused tokens; each guest asks after their wait `pollsPerMinute` times at most.
 */
export const guestRoutes = ({ calls, addressOf, origins, upgradeWebSocket, onError, report }: GuestRoutesInput) => {
  const app = new Hono()
  app.onError(onError)
  const limits = guestLimits()
  const address = (c: Context) => addressOf(c.req.raw) ?? 'no-trusted-address'
  const open = (c: Context) => {
    const at = address(c)
    if (limits.blocked(at)) throw tooMany()
    return at
  }
  const guestToken = (c: Context, at: string) => {
    const hash = tokenHash(guestTokenPrefix, bearer(c))
    if (!hash) {
      limits.refused(at)
      throw unauthorized('Send the token the lobby gave you')
    }
    if (!limits.poll(hash.toString('hex'))) throw tooMany()
    return hash
  }

  app.post('/lobby', async (c) => {
    const at = open(c)
    const body = (await c.req.json().catch(() => undefined)) as { link?: unknown; name?: unknown } | undefined
    if (!limits.enter(at)) throw tooMany()
    const name = guestName(body?.name)
    const link = tokenHash(linkTokenPrefix, body?.link)
    if (!link) {
      limits.refused(at)
      throw noLobby()
    }
    const token = newToken(guestTokenPrefix)
    const entered = await (await calls.runtime()).guests().enter({ link, name, token: tokenHash(guestTokenPrefix, token)! })
    if ('refused' in entered) {
      limits.refused(at)
      throw noLobby()
    }
    return c.json({ guest: entered.guest, token }, 201, noStore)
  })

  app.get('/lobby', async (c) => {
    const at = open(c)
    const hash = guestToken(c, at)
    const state = await (await calls.runtime()).guests().state(hash)
    if (!state) {
      limits.refused(at)
      throw unauthorized('This token lets nobody into a call')
    }
    return c.json(state, 200, noStore)
  })

  app.delete('/lobby', async (c) => {
    const at = open(c)
    await (await calls.runtime()).guests().leave(guestToken(c, at))
    return c.body(null, 204)
  })

  app.get('/socket', async (c) => {
    const at = open(c)
    if (!allowedOrigin(c.req.raw, origins)) throw forbidden('foreign-origin', 'This page’s origin may not open a socket to this app')
    const runtime = await calls.runtime()
    const acceptor = socketAcceptor({ c, upgradeWebSocket, report })
    return acceptor.answer('guest call', acceptor.accept(guestSocket(runtime, () => limits.refused(at))))
  })

  return app
}
