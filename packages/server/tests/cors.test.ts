import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAdmin, defineFunction, type AdminOptions, type MobileConfig } from '@protobase/server'
import { allResources, as, createFixtureDb, testAuthenticator } from '../../../test-support/server'

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
beforeAll(async () => {
  fixture = await createFixtureDb()
})
afterAll(async () => {
  await fixture.db.destroy()
})
afterEach(() => {
  vi.unstubAllEnvs()
})

const shop = 'https://shop.com'
const functions = {
  ping: defineFunction(async () => Response.json({ pong: true })),
  widget: defineFunction({ public: true, cors: { origin: 'https://widget.example.com' } }, async () => Response.json({ ok: true })),
}
const serve = (options: AdminOptions = {}, mobile?: MobileConfig) => createAdmin({ resources: allResources, db: fixture.db, authenticate: testAuthenticator, functions, options, ...(mobile && { mobile }) })
const allowedOrigin = async (app: ReturnType<typeof serve>, path: string, origin = shop) =>
  (await app.request(path, { headers: as(1, 'admin', { origin }) })).headers.get('access-control-allow-origin')

describe('CORS on the API', () => {
  it('is off without a setting: no CORS headers, as before', async () => {
    vi.stubEnv('PROTOBASE_CORS_ORIGINS', '')
    expect(await allowedOrigin(serve(), '/api/meta')).toBeNull()
  })

  it('allows the origins in PROTOBASE_CORS_ORIGINS on resources, system endpoints, functions and their problems', async () => {
    vi.stubEnv('PROTOBASE_CORS_ORIGINS', `${shop},https://other.example.com`)
    const app = serve()
    for (const path of ['/api/v1/companies', '/api/meta', '/api/openapi.json', '/api/functions/ping', '/api/v1/nothing']) {
      expect(await allowedOrigin(app, path), path).toBe(shop)
    }
    const unauthorized = await app.request('/api/v1/companies', { headers: { origin: shop } })
    expect(unauthorized.status).toBe(401)
    expect(unauthorized.headers.get('access-control-allow-origin')).toBe(shop)
    expect(await allowedOrigin(app, '/api/meta', 'https://evil.example.com')).toBeNull()
  })

  it('answers a preflight before authentication', async () => {
    const response = await serve({ cors: '*' }).request('/api/v1/companies/1', { method: 'OPTIONS', headers: { origin: shop, 'access-control-request-method': 'PATCH' } })
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('takes `cors` over the environment', async () => {
    vi.stubEnv('PROTOBASE_CORS_ORIGINS', '*')
    expect(await allowedOrigin(serve({ cors: ['https://other.example.com'] }), '/api/meta')).toBeNull()
  })

  it('leaves a function with its own `cors` to answer for itself', async () => {
    const app = serve({ cors: '*' })
    expect(await allowedOrigin(app, '/api/functions/widget', 'https://widget.example.com')).toBe('https://widget.example.com')
    expect(await allowedOrigin(app, '/api/functions/widget')).toBeNull()
  })
})

describe('CORS for a mobile app', () => {
  const mobile = { appId: 'com.example.shop' }
  const capacitor = ['capacitor://localhost', 'https://localhost']
  const preflight = (app: ReturnType<typeof serve>, path: string, origin: string) =>
    app.request(path, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization' } })

  it('allows both Capacitor origins, by name and without credentials, besides every other origin source', async () => {
    const settings: Array<[string, AdminOptions, string | undefined]> = [['none', {}, undefined], ['the environment', {}, shop], ['cors', { cors: [shop] }, shop]]
    for (const [setting, options, listed] of settings) {
      vi.stubEnv('PROTOBASE_CORS_ORIGINS', setting === 'the environment' ? shop : '')
      const app = serve(options, mobile)
      for (const origin of [...capacitor, ...(listed ? [listed] : [])]) {
        const response = await app.request('/api/meta', { headers: as(1, 'admin', { origin }) })
        expect(response.headers.get('access-control-allow-origin'), `${setting}: ${origin}`).toBe(origin)
        expect(response.headers.get('access-control-allow-credentials')).toBeNull()
        const answer = await preflight(app, '/api/v1/companies', origin)
        expect(answer.status).toBe(204)
        expect(answer.headers.get('access-control-allow-origin')).toBe(origin)
        expect(answer.headers.get('access-control-allow-headers')).toContain('authorization')
        expect(answer.headers.get('access-control-allow-credentials')).toBeNull()
      }
    }
  })

  it('gives look-alike origins and `null` no CORS headers', async () => {
    vi.stubEnv('PROTOBASE_CORS_ORIGINS', '')
    const app = serve({}, mobile)
    for (const origin of ['null', 'https://localhost:8443', 'https://localhost.evil.com', 'http://localhost', 'capacitor://localhost.evil.com', 'capacitor://evil']) {
      expect(await allowedOrigin(app, '/api/meta', origin), origin).toBeNull()
      expect((await preflight(app, '/api/meta', origin)).headers.get('access-control-allow-origin'), origin).toBeNull()
    }
  })

  it('gives the Capacitor origins nothing without a mobile section', async () => {
    vi.stubEnv('PROTOBASE_CORS_ORIGINS', '')
    for (const origin of capacitor) expect(await allowedOrigin(serve(), '/api/meta', origin)).toBeNull()
  })
})
