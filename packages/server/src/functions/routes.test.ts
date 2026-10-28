import { Hono } from 'hono'
import type { UpgradeWebSocket, WSContext, WSEvents } from 'hono/ws'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@protobase/query'
import { defineRoles } from '@protobase/schema'
import { createErrorHandler } from '../error-handler'
import { badRequest, forbidden, notFound, unauthorized } from '../problem'
import type { Session } from '../types'
import { defineFunction, type ApiFunction, type FunctionContext, type PublicFunctionContext } from './define-function'
import type { FieldReader } from '../encryption/decrypt-field-types'
import type { FunctionRecords } from './records'
import { functionRoutes } from './routes'

const db = { name: 'the database' } as unknown as Db
const sessions: Record<string, Session> = { ann: { user: { id: 'ann', roles: ['sales'] }, tenant: 1 }, bob: { user: { id: 'bob', roles: ['admin'] } } }

// Bearer tokens are user ids; anything else is the usual 401.
const authenticate = (request: Request) => {
  const session = sessions[request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '']
  if (!session) throw unauthorized('Missing or invalid bearer token')
  return session
}

const records = (session: Session) => ({ as: session.user.id }) as unknown as FunctionRecords
const channels = { broadcast: async () => {} }

// Each bound read says who it is for, so a test sees which reader the context was given.
const decryptField = vi.fn((reader: FieldReader) => async () => JSON.stringify(reader))

const serve = (functions: Record<string, ApiFunction>, onUnhandledError = vi.fn(), wake = vi.fn()) => ({
  app: functionRoutes({ basePath: '/api/functions', functions, authenticate, access: {}, db, records, channels, decryptField, onError: createErrorHandler(onUnhandledError), wake, report: onUnhandledError }),
  onUnhandledError,
  wake,
})

const as = (user: string, init: RequestInit = {}) => ({ ...init, headers: { authorization: `Bearer ${user}`, ...init.headers } })

describe('functionRoutes', () => {
  it('calls a function with the caller, their records and the database, for any method and below its name', async () => {
    const seen: Array<{ method: string; path: string; context: FunctionContext }> = []
    const { app } = serve({ hello: defineFunction((request, context) => {
      seen.push({ method: request.method, path: new URL(request.url).pathname, context })
      return Response.json({ hello: context.session.user.id })
    }) })

    const response = await app.request('/api/functions/hello', as('ann'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ hello: 'ann' })
    await app.request('/api/functions/hello/orders/7?x=1', as('bob', { method: 'DELETE' }))

    expect(seen.map(({ method, path }) => [method, path])).toEqual([['GET', '/'], ['DELETE', '/orders/7']])
    expect(seen[0]!.context).toMatchObject({ name: 'hello', db, session: sessions.ann, records: { as: 'ann' } })
    expect(await seen[0]!.context.caller()).toEqual({ session: sessions.ann, records: { as: 'ann' } })
  })

  it('gives a protected function a decryptField bound to the function, its caller and the request’s origin', async () => {
    const { app } = serve({ dispatch: defineFunction(async (_request, context) => new Response(await context.decryptField('targets', 1, 'password'))) })
    const response = await app.request('/api/functions/dispatch', as('ann', { headers: { 'user-agent': 'probe/1', 'x-forwarded-for': '203.0.113.9' } }))
    expect(JSON.parse(await response.text())).toEqual({ function: 'dispatch', actor: { id: 'ann', roles: ['sales'] }, origin: { userAgent: 'probe/1', forwardedFor: '203.0.113.9' } })
  })

  it('gives a public function no decryptField, as anyone may call it', async () => {
    const seen: PublicFunctionContext[] = []
    const { app } = serve({ hook: defineFunction({ public: true }, async (_request, context) => {
      seen.push(context)
      await context.caller()
      return new Response('ok')
    }) })
    expect((await app.request('/api/functions/hook', as('bob'))).status).toBe(200)
    expect(seen[0]).not.toHaveProperty('decryptField')
  })

  it('answers a call whose query the database stopped with a 504 naming the call, and reports it', async () => {
    const stopped = Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' })
    const { app, onUnhandledError, wake } = serve({ import: defineFunction(() => Promise.reject(stopped)) })
    const response = await app.request('/api/functions/import/rows', as('ann', { method: 'POST' }))
    expect(response.status).toBe(504)
    const { detail } = await response.json()
    expect(detail).toBe("POST /api/functions/import/rows ran a query longer than the database's statement timeout, so the database stopped it. Make the query faster, such as with an index or a narrower filter, or give it longQueries: true, whose queries may run up to 30 s.")
    expect(onUnhandledError).toHaveBeenCalledWith(expect.objectContaining({ message: detail }), expect.any(Request))
    expect(wake).toHaveBeenCalledOnce()
  })

  it('passes the body and the query through to the function', async () => {
    const { app } = serve({ echo: defineFunction(async (request) => Response.json({ body: await request.json(), q: new URL(request.url).searchParams.get('q') })) })
    const response = await app.request('/api/functions/echo/x?q=1', as('ann', { method: 'POST', body: JSON.stringify({ a: 1 }), headers: { 'content-type': 'application/json' } }))
    expect(await response.json()).toEqual({ body: { a: 1 }, q: '1' })
  })

  it('answers a call without a valid token with the authenticator’s 401 problem, before the function runs', async () => {
    const handler = vi.fn(() => new Response('never'))
    const { app } = serve({ hello: defineFunction(handler) })
    const response = await app.request('/api/functions/hello')
    expect(response.status).toBe(401)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    expect(await response.json()).toMatchObject({ type: 'urn:protobase:problem:unauthenticated', detail: 'Missing or invalid bearer token' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('lets anyone call a public function, which can still ask for the caller', async () => {
    const seen: PublicFunctionContext[] = []
    const { app } = serve({ webhook: defineFunction({ public: true }, (_request, context) => {
      seen.push(context)
      return new Response('ok')
    }), whoami: defineFunction({ public: true }, async (_request, context) => Response.json((await context.caller()).session)) })

    expect(await (await app.request('/api/functions/webhook', { method: 'POST' })).text()).toBe('ok')
    expect(seen[0]).not.toHaveProperty('session')
    expect(await (await app.request('/api/functions/whoami', as('bob'))).json()).toEqual(sessions.bob)
    expect((await app.request('/api/functions/whoami')).status).toBe(401)
  })

  it('refuses a caller without one of the function’s roles with a 403 problem', async () => {
    const { app } = serve({ report: defineFunction({ roles: ['admin'] }, () => new Response('report')) })
    expect((await app.request('/api/functions/report', as('bob'))).status).toBe(200)
    const refused = await app.request('/api/functions/report', as('ann'))
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ type: 'urn:protobase:problem:function-forbidden', detail: 'You may not call the function "report"' })
  })

  it('refuses a function without roles to every caller but those holding *, once the app defines roles', async () => {
    const roles = defineRoles({ admin: ['*'], sales: ['*.read'] })
    const app = functionRoutes({ basePath: '/api/functions', functions: { start: defineFunction(() => new Response('started')) }, authenticate, access: { roles }, db, records, channels, decryptField, onError: createErrorHandler(vi.fn()), wake: vi.fn(), report: vi.fn() })
    expect((await app.request('/api/functions/start', as('bob'))).status).toBe(200)
    const refused = await app.request('/api/functions/start', as('ann'))
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ type: 'urn:protobase:problem:function-forbidden', detail: 'You may not call the function "start"' })
  })

  it('answers an unknown function, or a name it only starts with, with a 404 problem', async () => {
    const { app } = serve({ hello: defineFunction(() => new Response('hi')) })
    for (const path of ['/api/functions/nothing', '/api/functions/hellothere', '/api/functions']) {
      const response = await app.request(path, as('ann'))
      expect(response.status).toBe(404)
      expect(response.headers.get('content-type')).toBe('application/problem+json')
    }
  })

  it('renders a thrown problem as problem+json, and reports any other error as a 500 without its message', async () => {
    const failure = new Error('secret detail')
    const { app, onUnhandledError } = serve({
      picky: defineFunction(() => {
        throw badRequest('invalid-input', 'Say please')
      }),
      broken: defineFunction(() => {
        throw failure
      }),
      empty: defineFunction((() => 'not a response') as never),
    })

    const picky = await app.request('/api/functions/picky', as('ann'))
    expect([picky.status, (await picky.json()).detail]).toEqual([400, 'Say please'])
    const broken = await app.request('/api/functions/broken', as('ann'))
    expect(broken.status).toBe(500)
    expect(JSON.stringify(await broken.json())).not.toContain('secret detail')
    expect((await app.request('/api/functions/empty', as('ann'))).status).toBe(500)
    expect(onUnhandledError.mock.calls.map(([error]) => (error as Error).message)).toEqual(['secret detail', 'The function "empty" returned no Response'])
  })

  it('wakes the change dispatcher once a call has ended, so its raw database writes reach pages before the next poll', async () => {
    const order: string[] = []
    const { app, wake } = serve({
      report: defineFunction({ public: true }, async () => {
        await Promise.resolve()
        order.push('written')
        return new Response('ok')
      }),
      broken: defineFunction(() => {
        throw new Error('after a write')
      }),
    })
    wake.mockImplementation(() => order.push('woken'))

    expect((await app.request('/api/functions/report', { method: 'POST' })).status).toBe(200)
    expect(order).toEqual(['written', 'woken'])
    expect((await app.request('/api/functions/broken', as('ann'))).status).toBe(500)
    expect(wake).toHaveBeenCalledTimes(2)
  })

  it('serves a Hono app below the function’s name, with the context as its env', async () => {
    const orders = new Hono<{ Bindings: FunctionContext }>()
    orders.get('/', (c) => c.json({ who: c.env.session.user.id }))
    orders.get('/:id', (c) => c.json({ id: c.req.param('id') }))
    const { app } = serve({ orders: defineFunction(orders) })

    expect(await (await app.request('/api/functions/orders', as('ann'))).json()).toEqual({ who: 'ann' })
    expect(await (await app.request('/api/functions/orders/42', as('ann'))).json()).toEqual({ id: '42' })
    expect((await app.request('/api/functions/orders/42')).status).toBe(401)
  })

  it('answers CORS preflights before authentication and adds the CORS headers to every response', async () => {
    const { app } = serve({ open: defineFunction({ cors: { origin: 'https://shop.example' } }, () => new Response('hi')) })
    const preflight = await app.request('/api/functions/open/x', { method: 'OPTIONS', headers: { origin: 'https://shop.example', 'access-control-request-method': 'POST' } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://shop.example')

    const refused = await app.request('/api/functions/open', { headers: { origin: 'https://shop.example' } })
    expect(refused.status).toBe(401)
    expect(refused.headers.get('access-control-allow-origin')).toBe('https://shop.example')
    const ok = await app.request('/api/functions/open', as('ann', { headers: { origin: 'https://shop.example' } }))
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://shop.example')
  })
})

describe('functionRoutes WebSocket upgrades', () => {
  afterEach(() => vi.useRealTimers())

  // The fake host answers an upgrade with 299, as no real response can be a 101.
  // Upgrades by cookie, as `upgradeAuthenticator` would: the cookie is the user id, from the app's own origin only.
  const upgradeAuthenticate = (request: Request) => {
    if (request.headers.has('origin') && request.headers.get('origin') !== 'https://app.example') throw forbidden('foreign-origin', 'Foreign')
    const user = request.headers.get('cookie')
    return user ? authenticate(new Request(request, { headers: { authorization: `Bearer ${user}` } })) : authenticate(request)
  }

  const serveSockets = (functions: Record<string, ApiFunction>) => {
    const upgrades: WSEvents[] = []
    const upgradeWebSocket = vi.fn(async (_c: unknown, events: WSEvents) => {
      upgrades.push(events)
      return new Response(null, { status: 299 })
    }) as unknown as UpgradeWebSocket
    const onUnhandledError = vi.fn()
    const app = functionRoutes({ basePath: '/api/functions', functions, authenticate, access: {}, db, records, channels, decryptField, onError: createErrorHandler(onUnhandledError), wake: vi.fn(), report: onUnhandledError, upgradeWebSocket, upgradeAuthenticate })
    return { app, upgrades }
  }

  const upgrade = (headers: Record<string, string> = {}) => ({ headers: { upgrade: 'websocket', ...headers } })

  it('upgrades a signed-in caller by their cookie, and refuses one without credentials before the function runs', async () => {
    const handler = vi.fn((_request: Request, context: FunctionContext) => context.acceptWebSocket({}))
    const { app, upgrades } = serveSockets({ chat: defineFunction(handler) })
    expect((await app.request('/api/functions/chat', upgrade({ cookie: 'ann', origin: 'https://app.example' }))).status).toBe(299)
    expect(handler.mock.calls[0]![1].session).toEqual(sessions.ann)
    const refused = await app.request('/api/functions/chat', upgrade())
    expect(refused.status).toBe(401)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(upgrades).toHaveLength(1)
  })

  it('refuses a caller without the role, or from a foreign origin, with 403 and no upgrade', async () => {
    const handler = vi.fn((_request: Request, context: FunctionContext) => context.acceptWebSocket({}))
    const { app, upgrades } = serveSockets({ console: defineFunction({ roles: ['admin'] }, handler) })
    expect((await app.request('/api/functions/console', upgrade({ cookie: 'ann' }))).status).toBe(403)
    expect((await app.request('/api/functions/console', upgrade({ cookie: 'bob', origin: 'https://evil.example' }))).status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
    expect(upgrades).toHaveLength(0)
  })

  it('never upgrades when the function accepted and then threw', async () => {
    const { app, upgrades } = serveSockets({
      chat: defineFunction(async (_request, context) => {
        context.acceptWebSocket({})
        throw badRequest('invalid-input', 'Changed my mind')
      }),
    })
    expect((await app.request('/api/functions/chat', upgrade({ cookie: 'ann' }))).status).toBe(400)
    expect(upgrades).toHaveLength(0)
  })

  it('lets a public function accept without a caller from any origin, and refuses its caller() from a foreign one', async () => {
    const { app, upgrades } = serveSockets({
      agent: defineFunction({ public: true }, (_request, context) => context.acceptWebSocket({})),
      whoami: defineFunction({ public: true }, async (_request, context) => {
        await context.caller()
        return context.acceptWebSocket({})
      }),
    })
    expect((await app.request('/api/functions/agent', upgrade({ origin: 'https://evil.example' }))).status).toBe(299)
    expect((await app.request('/api/functions/agent', upgrade())).status).toBe(299)
    expect((await app.request('/api/functions/whoami', upgrade({ cookie: 'ann', origin: 'https://evil.example' }))).status).toBe(403)
    expect(upgrades).toHaveLength(2)
  })

  it('answers acceptWebSocket on a plain call with 426', async () => {
    const { app } = serveSockets({ chat: defineFunction((_request, context) => context.acceptWebSocket({})) })
    expect((await app.request('/api/functions/chat', as('ann'))).status).toBe(426)
  })

  it('closes an open socket with 1008 once its caller is refused, or comes back with other roles', async () => {
    vi.useFakeTimers()
    const { app, upgrades } = serveSockets({ chat: defineFunction((_request, context) => context.acceptWebSocket({})) })
    const opened = async (user: string) => {
      await app.request('/api/functions/chat', upgrade({ cookie: user }))
      const raw = { readyState: 1, bufferedAmount: 0, send: vi.fn(), close: vi.fn() }
      upgrades.at(-1)!.onOpen!(new Event('open'), { raw } as unknown as WSContext)
      return raw
    }
    sessions.cy = { user: { id: 'cy', roles: ['sales'] } }
    sessions.dee = { user: { id: 'dee', roles: ['sales'] } }
    const cy = await opened('cy')
    const dee = await opened('dee')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(cy.close).not.toHaveBeenCalled()

    delete sessions.cy
    sessions.dee = { user: { id: 'dee', roles: ['admin'] } }
    await vi.advanceTimersByTimeAsync(60_000)
    expect(cy.close).toHaveBeenCalledWith(1008, 'Unauthorized')
    expect(dee.close).toHaveBeenCalledWith(1008, 'Forbidden')
    delete sessions.dee
  })
  const openSocket = async (app: Hono, upgrades: WSEvents[], path: string, headers: Record<string, string> = {}) => {
    await app.request(path, upgrade(headers))
    const raw = { readyState: 1, bufferedAmount: 0, send: vi.fn(), close: vi.fn() }
    const events = upgrades.at(-1)!
    events.onOpen!(new Event('open'), { raw } as unknown as WSContext)
    const message = (data: string) => events.onMessage!({ data } as MessageEvent, {} as WSContext)
    return { raw, message }
  }

  it('closes a public function’s socket with 1008 once the caller it resolved is refused, changed or moved to another organization', async () => {
    vi.useFakeTimers()
    const { app, upgrades } = serveSockets({
      whoami: defineFunction({ public: true }, async (_request, context) => {
        await context.caller()
        return context.acceptWebSocket({})
      }),
    })
    sessions.cy = { user: { id: 'cy', roles: ['sales'] } }
    sessions.dee = { user: { id: 'dee', roles: ['sales'] } }
    sessions.eve = { user: { id: 'eve', roles: ['sales'] }, organization: { id: 'a' } }
    const cy = await openSocket(app, upgrades, '/api/functions/whoami', { cookie: 'cy' })
    const dee = await openSocket(app, upgrades, '/api/functions/whoami', { cookie: 'dee' })
    const eve = await openSocket(app, upgrades, '/api/functions/whoami', { cookie: 'eve' })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(cy.raw.close).not.toHaveBeenCalled()

    delete sessions.cy
    sessions.dee = { user: { id: 'dee', roles: ['admin'] } }
    sessions.eve = { user: { id: 'eve', roles: ['sales'] }, organization: { id: 'b' } }
    await vi.advanceTimersByTimeAsync(60_000)
    expect(cy.raw.close).toHaveBeenCalledWith(1008, 'Unauthorized')
    expect(dee.raw.close).toHaveBeenCalledWith(1008, 'Forbidden')
    expect(eve.raw.close).toHaveBeenCalledWith(1008, 'Forbidden')
    delete sessions.dee
    delete sessions.eve
  })

  it('leaves a public socket that resolved no caller open, and checks one that resolved it inside onMessage from then on', async () => {
    vi.useFakeTimers()
    const { app, upgrades } = serveSockets({
      agent: defineFunction({ public: true }, (_request, context) => context.acceptWebSocket({})),
      late: defineFunction({ public: true }, (_request, context) => context.acceptWebSocket({ onMessage: async () => void (await context.caller()) })),
    })
    sessions.fay = { user: { id: 'fay', roles: ['sales'] } }
    const agent = await openSocket(app, upgrades, '/api/functions/agent', { cookie: 'fay' })
    const late = await openSocket(app, upgrades, '/api/functions/late', { cookie: 'fay' })
    late.message('hello')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(late.raw.close).not.toHaveBeenCalled()

    delete sessions.fay
    await vi.advanceTimersByTimeAsync(60_000)
    expect(late.raw.close).toHaveBeenCalledWith(1008, 'Unauthorized')
    expect(agent.raw.close).not.toHaveBeenCalled()
  })

  it('runs a protected function’s own recheck after the caller’s, closing with 1008 on its 404', async () => {
    vi.useFakeTimers()
    let visible = true
    const recheck = vi.fn(() => {
      if (!visible) throw notFound('No such repair')
    })
    const { app, upgrades } = serveSockets({ watch: defineFunction((_request, context) => context.acceptWebSocket({ recheck })) })
    const watch = await openSocket(app, upgrades, '/api/functions/watch', { cookie: 'ann' })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(recheck).toHaveBeenCalledTimes(1)
    visible = false
    await vi.advanceTimersByTimeAsync(60_000)
    expect(watch.raw.close).toHaveBeenCalledWith(1008, 'Not Found')
  })
})
