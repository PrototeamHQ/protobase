import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import type { Db } from '@protobase/query'
import { createErrorHandler } from '../error-handler'
import { badRequest, unauthorized } from '../problem'
import type { Session } from '../types'
import { defineFunction, type ApiFunction, type FunctionContext, type PublicFunctionContext } from './define-function'
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

const serve = (functions: Record<string, ApiFunction>, onUnhandledError = vi.fn()) => ({
  app: functionRoutes({ basePath: '/api/functions', functions, authenticate, db, records, onError: createErrorHandler(onUnhandledError) }),
  onUnhandledError,
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
