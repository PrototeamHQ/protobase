import { describe, expect, it, vi } from 'vitest'
import type { Db } from '@protobase/query'
import type { ApiKeys } from '../api-keys/api-key-settings'
import { apiKeyCaller } from '../api-keys/resolve-caller'
import { createErrorHandler } from '../error-handler'
import { unauthorized } from '../problem'
import { defineFunction, type ApiFunction, type KeyFunctionContext } from './define-function'
import { supabaseFunctionRoutes } from './supabase-routes'

const db = { name: 'the database' } as unknown as Db
const keys: ApiKeys = { publishable: 'sb_publishable_1', secret: 'sb_secret_1' }

// A user token is `a.b.<user id>`; a JWT whose last part is `bad` does not verify.
const verify = async (token: string) => {
  const sub = token.split('.')[2]
  if (sub === 'bad') throw unauthorized('The token does not verify')
  return { sub, role: 'authenticated' }
}

const serve = (functions: Record<string, ApiFunction>, appKeys = keys) =>
  supabaseFunctionRoutes({ functions, db, keys: appKeys, caller: apiKeyCaller({ keys: appKeys, verify }), onError: createErrorHandler(vi.fn()) })

const invoke = (bearer?: string, init: RequestInit = {}) => ({ ...init, headers: { apikey: keys.publishable!, ...(bearer && { authorization: `Bearer ${bearer}` }), ...init.headers } })

// Answers with the path it sees and the caller the context resolves.
const echo = async (request: Request, context: KeyFunctionContext) => Response.json({ path: new URL(request.url).pathname, caller: await context.caller() })

describe('supabaseFunctionRoutes', () => {
  it('lets in a call with the publishable key, as the signed-in user of its token, with the path from the name on', async () => {
    const app = serve({ hello: defineFunction(echo as never) })
    const response = await app.request('/api/sb/functions/v1/hello/orders/7?x=1', invoke('a.b.ann', { method: 'POST' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ path: '/hello/orders/7', caller: { role: 'authenticated', claims: { sub: 'ann', role: 'authenticated' } } })
    expect(await (await app.request('/api/sb/functions/v1/hello', invoke(keys.publishable))).json()).toMatchObject({ caller: { role: 'anon' } })
  })

  it("refuses a protected function's call without a key or with a token that does not verify, before it runs", async () => {
    const handler = vi.fn(() => new Response('never'))
    const app = serve({ hello: defineFunction(handler) })
    expect((await app.request('/api/sb/functions/v1/hello')).status).toBe(401)
    expect((await app.request('/api/sb/functions/v1/hello', invoke('a.b.bad'))).status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it('lets anyone call a public function, which resolves the caller only when it asks', async () => {
    const app = serve({ webhook: defineFunction({ public: true }, () => new Response('ok')), whoami: defineFunction({ public: true }, echo as never) })
    expect(await (await app.request('/api/sb/functions/v1/webhook', { method: 'POST' })).text()).toBe('ok')
    expect((await app.request('/api/sb/functions/v1/whoami')).status).toBe(401)
  })

  it('passes a preflight to a protected function, which answers CORS itself', async () => {
    const app = serve({ hello: defineFunction({ fetch: (request: Request) => new Response(request.method === 'OPTIONS' ? 'ok' : 'hi', { headers: { 'access-control-allow-origin': '*' } }) }) })
    const response = await app.request('/api/sb/functions/v1/hello', { method: 'OPTIONS' })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok')
  })

  it('serves a function with roles, and every function of an app without keys but the public ones, nowhere here', async () => {
    const app = serve({ admin: defineFunction({ roles: ['admin'] }, () => new Response('never')) })
    const response = await app.request('/api/sb/functions/v1/admin', invoke('a.b.ann'))
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ detail: 'The function "admin" checks roles, so it is served at /api/functions/admin only' })

    const keyless = serve({ hello: defineFunction(echo as never), open: defineFunction({ public: true }, () => new Response('ok')) }, {})
    expect(await (await keyless.request('/api/sb/functions/v1/hello', invoke('a.b.ann'))).json()).toMatchObject({ status: 401, detail: 'This app has no keys, so only its public functions answer here' })
    expect((await keyless.request('/api/sb/functions/v1/open')).status).toBe(200)
    expect((await keyless.request('/api/sb/functions/v1/missing')).status).toBe(404)
  })
})
