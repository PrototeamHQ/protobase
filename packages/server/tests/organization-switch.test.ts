import { describe, expect, it, vi } from 'vitest'
import { claimsOf, organizationsApp, origin } from './support/organizations-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

const { serve } = organizationsApp()

describe('working in another organization', () => {
  it('lets someone with a global role enter any organization, audited, with only their global roles there', async () => {
    const app = await serve({}, { people: true })
    const ana = await app.signIn('ana@example.com')
    const found = await (await app.request('/api/auth/organization/search?query=Glo', { cookie: ana })).json()
    expect(found).toEqual({ organizations: [{ id: '2', name: 'Globex', slug: 'globex' }], total: 1 })
    const every = await (await app.request('/api/auth/organization/search', { cookie: ana })).json()
    expect(every.total).toBe(every.organizations.length)
    expect(every.organizations).toContainEqual({ id: '2', name: 'Globex', slug: 'globex' })
    const second = await (await app.request('/api/auth/organization/search?offset=1', { cookie: ana })).json()
    expect(second).toEqual({ organizations: every.organizations.slice(1), total: every.total })
    expect((await app.request('/api/auth/organization/switch', { cookie: ana, body: { organizationId: '2' } })).status).toBe(200)
    expect(app.audited).toEqual([{ type: 'organization.entered', at: expect.any(String), actor: { id: expect.any(String), roles: ['support'] }, organization: '2', origin: expect.any(Object) }])
    const claims = await claimsOf(app, ana)
    expect(claims).toMatchObject({ role: 'support', org: '2' })
    expect(claims).not.toHaveProperty('org_role')
    // The next sign-in starts there
    expect(await claimsOf(app, await app.signIn('ana@example.com'))).toMatchObject({ org: '2' })
  })

  it('refuses someone without a global role an organization they are not in, and the search', async () => {
    const app = await serve({}, { people: true })
    const sanne = await app.signIn('sanne@example.com')
    expect(await (await app.request('/api/auth/organization/switch', { cookie: sanne, body: { organizationId: '2' } })).json()).toMatchObject({ code: 'NOT_A_MEMBER' })
    expect((await app.request('/api/auth/organization/search?query=Glo', { cookie: sanne })).status).toBe(403)
    expect((await app.request('/api/auth/organization/search', { cookie: sanne })).status).toBe(403)
    expect((await app.request('/api/auth/organization/set-active', { cookie: sanne, body: { organizationId: '1' } })).status).toBe(404)
    expect(app.audited).toEqual([])
  })

  // Another page on the same site sends the session cookie along: a switch it sends as `text/plain`, which needs no
  // preflight, or from its own origin is refused before it reads the session.
  it('refuses a switch sent as text/plain or from another origin, and leaves the organization as it was', async () => {
    const app = await serve({}, { people: true })
    // Better Auth skips its origin check under a test runner, so it is turned back on here.
    ;(await app.auth.$context).skipOriginCheck = false
    const ana = await app.signIn('ana@example.com')
    const switchTo = (headers: Record<string, string>) => app.request('/api/auth/organization/switch', { cookie: ana, body: { organizationId: '2' }, headers })
    expect((await switchTo({ 'content-type': 'text/plain' })).status).toBe(415)
    expect(await (await switchTo({ origin: 'http://shop.localhost:5173' })).json()).toMatchObject({ code: 'INVALID_ORIGIN' })
    expect(app.audited).toEqual([])
    expect(await claimsOf(app, ana)).not.toHaveProperty('org')
    expect((await switchTo({})).status).toBe(200)
  })
})
