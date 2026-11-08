import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { ownRouteGuard } from './own-route-guard'

const own = 'https://admin.example.com'
const context = { skipCSRFCheck: false, skipOriginCheck: false, trustedOrigins: [own], isTrustedOrigin(url: string) { return this.trustedOrigins.includes(new URL(url).origin) } }

const statusOf = async (headers: Record<string, string>, { mobile = false, skipOriginCheck = false } = {}) => {
  const app = new Hono().post('/switch', ownRouteGuard({ context: async () => ({ ...context, skipOriginCheck }), mobile }), (c) => c.json({ ok: true }))
  return (await app.request(`${own}/switch`, { method: 'POST', headers, body: '{}' })).status
}

const json = { 'content-type': 'application/json', cookie: 'session=1' }

describe('ownRouteGuard', () => {
  it('lets a JSON request from a trusted origin through, by its Origin or else its Referer', async () => {
    expect(await statusOf({ ...json, origin: own })).toBe(200)
    expect(await statusOf({ ...json, referer: `${own}/companies` })).toBe(200)
    expect(await statusOf({ 'content-type': 'application/json; charset=utf-8', cookie: 'session=1', origin: own })).toBe(200)
  })

  it('refuses a body a page sends without a preflight, whatever the origin', async () => {
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) {
      expect(await statusOf({ cookie: 'session=1', origin: own, 'content-type': type }), type).toBe(415)
    }
    expect(await statusOf({ cookie: 'session=1', origin: own })).toBe(415)
  })

  it('refuses a request with cookies from another origin, a null one or none', async () => {
    expect(await statusOf({ ...json, origin: 'https://other.example.com' })).toBe(403)
    expect(await statusOf({ ...json, origin: 'null' })).toBe(403)
    expect(await statusOf(json)).toBe(403)
  })

  it('leaves the origin of a request without cookies, or one Better Auth is told to skip, alone', async () => {
    expect(await statusOf({ 'content-type': 'application/json', origin: 'https://other.example.com' })).toBe(200)
    expect(await statusOf({ ...json, origin: 'https://other.example.com' }, { skipOriginCheck: true })).toBe(200)
  })

  it('trusts the Capacitor origins only with a mobile section', async () => {
    expect(await statusOf({ ...json, origin: 'capacitor://localhost' })).toBe(403)
    expect(await statusOf({ ...json, origin: 'capacitor://localhost' }, { mobile: true })).toBe(200)
  })
})
