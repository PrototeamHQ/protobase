import { decodeJwt } from 'jose'
import { describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { addMember } from '../src/better-auth/organizations/host'
import { issueToken } from '../src/better-auth/tokens'
import { organizationsApp, origin } from './support/organizations-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

const { serve } = organizationsApp()

describe('the token of a signed-in person', () => {
  it('carries the organization they start in, their organization role and app roles; the API sees only its rows', async () => {
    const { auth, request, signIn, tokenOf } = await serve({}, { people: true })
    const token = await tokenOf(await signIn('sanne@example.com'))
    expect(decodeJwt(token)).toMatchObject({ role: 'user', org: '1', org_role: 'member', app_roles: ['sales'] })
    const companies = await (await request('/api/v1/companies?page_size=5&fields=id,organizationId', { token })).json()
    expect(companies.items.length).toBeGreaterThan(0)
    expect(new Set(companies.items.map((company: { organizationId: number }) => company.organizationId))).toEqual(new Set([1]))
  })

  it('carries one role, the first of the global roles and then the membership roles, never the placeholder user', async () => {
    const { auth, signIn, tokenOf } = await serve({}, { people: true })
    const authenticate = betterAuthAuthenticator({ auth })
    const session = await authenticate(new Request(origin, { headers: { authorization: `Bearer ${await tokenOf(await signIn('root@example.com'))}` } }))
    // Root starts in Globex, the first they own.
    expect(session).toEqual({ user: { id: expect.any(String), roles: ['admin'] }, tenant: '2', organization: { id: '2', role: 'owner' }, signIn: { session: expect.any(String), staff: false, strongAt: expect.any(Function) }, memberships: expect.any(Function) })
    const sanne = await authenticate(new Request(origin, { headers: { authorization: `Bearer ${await tokenOf(await signIn('sanne@example.com'))}` } }))
    expect(sanne.user.roles).toEqual(['sales'])
    expect(sanne.organization).toEqual({ id: '1', role: 'member' })
  })

  it('has no organization for someone in none, and the tenant resources refuse them', async () => {
    const { auth, request, signIn, tokenOf } = await serve({}, { people: true })
    const token = await tokenOf(await signIn('ana@example.com'))
    expect(decodeJwt(token)).not.toHaveProperty('org')
    expect((await request('/api/v1/companies', { token })).status).toBe(403)
  })
})

// A token's claims apart from those of the moment it was made and the session it came from.
const lastingClaims = (token: string) => {
  const { iat, exp, sid, jti, ...claims } = decodeJwt(token)
  return claims
}

describe('a token from issueToken', () => {
  it('has the claims of a new session\'s token, and reads the tenant rows its app role may read', async () => {
    const { auth, request, signIn, tokenOf } = await serve({}, { people: true })
    const { token } = await issueToken(auth, { email: 'sanne@example.com' })
    expect(lastingClaims(token)).toEqual(lastingClaims(await tokenOf(await signIn('sanne@example.com'))))
    expect(decodeJwt(token)).toMatchObject({ org: '1', org_role: 'member', app_roles: ['sales'] })
    const companies = await (await request('/api/v1/companies?page_size=5&fields=id,organizationId', { token })).json()
    expect(companies.items.length).toBeGreaterThan(0)
    expect(new Set(companies.items.map((company: { organizationId: number }) => company.organizationId))).toEqual(new Set([1]))
  })

  it('has no organization for someone in none', async () => {
    const { auth } = await serve({}, { people: true })
    expect(decodeJwt((await issueToken(auth, { email: 'ana@example.com' })).token)).not.toHaveProperty('org')
  })

  it('works in the organization named, by slug or id, and is refused one the person may not work in', async () => {
    const { auth, request } = await serve({}, { people: true })
    await addMember(auth, { organization: 'globex', email: 'sanne@example.com', appRoles: ['accountant'] })
    const { token } = await issueToken(auth, { email: 'sanne@example.com', organization: 'globex' })
    expect(decodeJwt(token)).toMatchObject({ role: 'user', org: '2', org_role: 'member', app_roles: ['accountant'] })
    const companies = await (await request('/api/v1/companies?page_size=5&fields=id,organizationId', { token })).json()
    expect(new Set(companies.items.map((company: { organizationId: number }) => company.organizationId))).toEqual(new Set([2]))
    expect(decodeJwt((await issueToken(auth, { email: 'sanne@example.com', organization: '1' })).token)).toMatchObject({ org: '1', app_roles: ['sales'] })
    await expect(issueToken(auth, { email: 'bo@example.com', organization: 'globex' })).rejects.toThrow('may not work in organization "globex"')
    await expect(issueToken(auth, { email: 'bo@example.com', organization: 'nowhere' })).rejects.toThrow('No organization "nowhere"')
  })
})
