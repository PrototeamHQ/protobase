import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAdmin, defineFunction, type AdminOptions } from '@protobase/server'
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
const serve = (options: AdminOptions = {}) => createAdmin({ resources: allResources, db: fixture.db, authenticate: testAuthenticator, functions, options })
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
