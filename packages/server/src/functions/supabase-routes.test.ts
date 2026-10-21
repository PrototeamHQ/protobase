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
    const app = serve({ hello: defineFunction({ supabase: true }, echo as never) })
    const response = await app.request('/api/sb/functions/v1/hello/orders/7?x=1', invoke('a.b.ann', { method: 'POST' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ path: '/hello/orders/7', caller: { role: 'authenticated', claims: { sub: 'ann', role: 'authenticated' } } })
    expect(await (await app.request('/api/sb/functions/v1/hello', invoke(keys.publishable))).json()).toMatchObject({ caller: { role: 'anon' } })
  })

  it("refuses a protected function's call without a key or with a token that does not verify, before it runs", async () => {
    const handler = vi.fn(() => new Response('never'))
    const app = serve({ hello: defineFunction({ supabase: true }, handler) })
    expect((await app.request('/api/sb/functions/v1/hello')).status).toBe(401)
    expect((await app.request('/api/sb/functions/v1/hello', invoke('a.b.bad'))).status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it('lets anyone call a public function, which resolves the caller only when it asks', async () => {
    const app = serve({ webhook: defineFunction({ public: true, supabase: true }, () => new Response('ok')), whoami: defineFunction({ public: true, supabase: true }, echo as never) })
    expect(await (await app.request('/api/sb/functions/v1/webhook', { method: 'POST' })).text()).toBe('ok')
    expect((await app.request('/api/sb/functions/v1/whoami')).status).toBe(401)
  })

  it('passes a preflight to a protected function, which answers CORS itself', async () => {
    const app = serve({ hello: defineFunction({ supabase: true }, { fetch: (request: Request) => new Response(request.method === 'OPTIONS' ? 'ok' : 'hi', { headers: { 'access-control-allow-origin': '*' } }) }) })
    const response = await app.request('/api/sb/functions/v1/hello', { method: 'OPTIONS' })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok')
  })

  it('serves every function of an app without keys but the public ones nowhere here', async () => {
    const keyless = serve({ hello: defineFunction({ supabase: true }, echo as never), open: defineFunction({ public: true, supabase: true }, () => new Response('ok')) }, {})
    expect(await (await keyless.request('/api/sb/functions/v1/hello', invoke('a.b.ann'))).json()).toMatchObject({ status: 401, detail: 'This app has no keys, so only its public functions answer here' })
    expect((await keyless.request('/api/sb/functions/v1/open')).status).toBe(200)
    expect((await keyless.request('/api/sb/functions/v1/missing')).status).toBe(404)
  })

  it('serves a converted function, as the importer writes it, to the publishable key alone, and its public twin to anyone', async () => {
    const app = serve({
      hello: defineFunction({ supabase: true }, { fetch: () => new Response('hi') }),
      open: defineFunction({ public: true, supabase: true }, { fetch: () => new Response('hi') }),
    })
    const hello = await app.request('/api/sb/functions/v1/hello', invoke(keys.publishable))
    expect([hello.status, await hello.text()]).toEqual([200, 'hi'])
    expect((await app.request('/api/sb/functions/v1/open', { method: 'POST' })).status).toBe(200)
  })

  describe('a function without supabase: true', () => {
    const notHere = (name: string) => ({ status: 404, detail: `The function "${name}" answers at /api/functions/${name} only: give it supabase: true to answer here too` })
    const kinds = () => {
      const handler = vi.fn(() => new Response('never'))
      const app = vi.fn(() => new Response('never'))
      const fns: Record<string, ApiFunction> = {
        plain: defineFunction(handler),
        gated: defineFunction({ capability: 'vms.update' }, handler),
        admin: defineFunction({ roles: ['admin'] }, handler),
        unset: defineFunction({ roles: ['admin'], supabase: false }, handler),
        open: defineFunction({ public: true }, handler),
        bare: defineFunction({ fetch: handler }),
        hono: defineFunction({ fetch: app }),
        // What an unchecked module may pass: only the boolean true serves a function here.
        text: defineFunction({ supabase: 'true' as never }, handler),
        one: defineFunction({ supabase: 1 as never }, handler),
        object: defineFunction({ supabase: {} as never }, handler),
        widget: defineFunction({ public: true, cors: { origin: '*', credentials: true } }, handler),
      }
      return { handler, app, fns }
    }
    const requests = (): [string, RequestInit][] => [
      ['', invoke(keys.publishable)],
      ['', invoke(keys.secret, { method: 'POST', headers: { apikey: keys.secret! } })],
      ['', invoke('a.b.ann', { method: 'POST' })],
      ['', { headers: { cookie: 'better-auth.session_token=ann' } }],
      ['', { method: 'POST' }],
      ['/a/b', { method: 'POST' }],
      ['', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } }],
      ['/a/b', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } }],
    ]

    for (const appKeys of [keys, {}]) {
      it(`answers 404 with a hint to any caller, a preflight too, and runs none of its code${appKeys === keys ? '' : ', in an app without keys'}`, async () => {
        const { handler, app, fns } = kinds()
        const routes = serve(fns, appKeys)
        for (const name of Object.keys(fns)) {
          for (const [rest, init] of requests()) {
            const response = await routes.request(`/api/sb/functions/v1/${name}${rest}`, init)
            expect(await response.json(), `${name}${rest} ${init.method ?? 'GET'}`).toMatchObject(notHere(name))
            expect([...response.headers.keys()].filter((header) => header.startsWith('access-control-')), name).toEqual([])
          }
        }
        expect(handler).not.toHaveBeenCalled()
        expect(app).not.toHaveBeenCalled()
      })
    }
  })

  it('stops startup for supabase: true with roles or a capability, of any value and on a public function too', () => {
    const handler = () => new Response('never')
    expect(() => serve({ admin: defineFunction({ roles: ['admin'], supabase: true }, handler) })).toThrow('The function "admin" has supabase: true and roles, which /api/sb/functions/v1 cannot check: drop one')
    expect(() => serve({ vms: defineFunction({ capability: 'vms.update', supabase: true }, handler) })).toThrow('The function "vms" has supabase: true and a capability, which /api/sb/functions/v1 cannot check: drop one')
    expect(() => serve({ admin: defineFunction({ roles: [], supabase: true }, handler) })).toThrow('and roles')
    expect(() => serve({ vms: defineFunction({ capability: '' as never, supabase: true }, handler) })).toThrow('and a capability')
    expect(() => serve({ admin: defineFunction({ public: true, supabase: true, roles: ['admin'] } as never, handler) })).toThrow('and roles')
    expect(() => serve({ vms: defineFunction({ public: true, supabase: true, capability: 'x' } as never, handler) })).toThrow('and a capability')
  })
})
