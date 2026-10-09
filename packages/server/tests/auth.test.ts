import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { jwtAuthenticator } from '../src/auth/jwt'
import { createAdmin } from '../src/create-admin'
import { allResources, as, createFixtureDb, testAuthenticator } from '../../../test-support/server'

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
beforeAll(async () => { fixture = await createFixtureDb() })
afterAll(async () => { await fixture.db.destroy() })

const adminWith = (authenticate: Parameters<typeof createAdmin>[0]['authenticate']) =>
  createAdmin({ resources: allResources, db: fixture.db, authenticate })

const { publicKey, privateKey } = await generateKeyPair('RS256')
const jwk = { ...(await exportJWK(publicKey)), alg: 'RS256', kid: 'k1' }
const other = await generateKeyPair('RS256')

describe('jwt authenticator', () => {
  const sign = (claims: Record<string, unknown>, key = privateKey, expires = '5m') =>
    new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setSubject('u1').setIssuer('https://issuer').setExpirationTime(expires).sign(key)
  let app: ReturnType<typeof adminWith>
  beforeAll(() => { app = adminWith(jwtAuthenticator({ keys: createLocalJWKSet({ keys: [jwk] }), issuer: 'https://issuer' })) })
  const call = (path: string, token?: string) => app.request(`/api/v1${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} })

  it('accepts a valid token and reads the tenant claim', async () => {
    const body = await (await call('/companies?count=exact&page_size=1', await sign({ tenant: 2, roles: ['admin'] }))).json()
    expect(body.total_size).toBe(495)
  })

  it('answers 401 problems without a token, with a bad signature or an expired token', async () => {
    const missing = await call('/companies')
    expect(missing.status).toBe(401)
    expect(missing.headers.get('www-authenticate')).toBe('Bearer')
    expect(missing.headers.get('content-type')).toContain('application/problem+json')
    expect((await call('/companies', await sign({ tenant: 1 }, other.privateKey))).status).toBe(401)
    expect((await call('/companies', await sign({ tenant: 1 }, privateKey, '-1m'))).status).toBe(401)
    expect((await call('/companies', 'not-a-jwt')).status).toBe(401)
  })

  it('needs a key source', () => {
    expect(() => jwtAuthenticator({})).toThrow('jwksUrl or keys')
  })
})

describe('every route needs a credential', () => {
  const app = createAdmin({ resources: allResources, db: undefined as never, authenticate: testAuthenticator })
  const routes: Array<[string, string]> = [
    ['GET', '/companies'],
    ['POST', '/companies:search'],
    ['GET', '/companies/1'],
    ['POST', '/companies'],
    ['PATCH', '/companies/1'],
    ['DELETE', '/companies/1'],
    ['POST', '/companies/1:undelete'],
    ['GET', '/companies:facets?field=status'],
    ['GET', '/companies:series?field=createdAt'],
    ['GET', '/companies:histogram?field=revenue'],
    ['GET', '/companies:seek?position=0'],
  ]

  const system: Array<[string, string]> = [['GET', '/api/meta'], ['GET', '/api/openapi.json'], ['GET', '/api/docs']]

  it.each([...routes.map(([method, path]): [string, string] => [method, `/api/v1${path}`]), ...system])('%s %s without a token is a 401 problem', async (method, path) => {
    const response = await app.request(path, { method, ...(method === 'GET' ? {} : { body: '{}', headers: { 'content-type': 'application/json' } }) })
    expect(response.status).toBe(401)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
  })

  it('refuses a token signed with another key', async () => {
    const other = jwtAuthenticator({ keys: async () => new TextEncoder().encode('another-secret-another-secret-another'), algorithms: ['HS256'] })
    const forged = createAdmin({ resources: allResources, db: undefined as never, authenticate: other })
    expect((await forged.request('/api/v1/companies', { headers: as(1) })).status).toBe(401)
  })
})
