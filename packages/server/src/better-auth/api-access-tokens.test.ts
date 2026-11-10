import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import type { Authenticator } from '../types'
import { betterAuthAuthenticator } from './authenticator'
import type { AdminAuth } from './create-auth'
import { fakeAdapter } from './testing/fake-adapter'

const issuer = 'https://admin.example.com'
const apiResource = `${issuer}/api`
const mcpResource = `${issuer}/api/mcp`

const appKeys = await generateKeyPair('EdDSA')
const appJwk = { ...(await exportJWK(appKeys.publicKey)), alg: 'EdDSA', kid: 'app' }
const otherKeys = await generateKeyPair('EdDSA')

// The store, where Ana works in organization 1 as sales and allowed the watch app.
const allowedAt = new Date(Date.now() - 60_000)
const tables = () => ({
  user: [{ id: 'ana', role: 'user', banned: false, banExpires: null }],
  member: [{ id: 'm1', organizationId: '1', userId: 'ana', role: 'member', appRoles: ['sales'] }],
  organization: [{ id: '1' }],
  oauthConsent: [{ id: 'c-watch', userId: 'ana', clientId: 'watch', createdAt: allowedAt }],
})

const authOver = (adapter: unknown, oauthApi?: { resource: string }) =>
  ({ issuer, oauthApi, api: { getJwks: async () => ({ keys: [appJwk] }) }, $context: Promise.resolve({ adapter }) }) as unknown as AdminAuth

const withApi = betterAuthAuthenticator({ auth: authOver(fakeAdapter(tables()).adapter, { resource: apiResource }), organizations: true })

type TokenInput = { aud?: string; typ?: string; key?: CryptoKey; client?: string; claims?: Record<string, unknown>; exp?: string | number }
const token = ({ aud = apiResource, typ = 'at+jwt', key = appKeys.privateKey, client = 'watch', claims = {}, exp = '5m' }: TokenInput = {}) =>
  new SignJWT({ role: 'user', org: '1', app_roles: ['sales'], client_id: client, scope: 'mcp offline_access', ...claims })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'app', typ })
    .setSubject('ana')
    .setIssuer(issuer)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key)

const request = (authorization: string) => new Request(`${apiResource}/v1/companies`, { headers: { authorization } })

const refused = (authenticate: Authenticator, req: Request) => expect(Promise.resolve().then(() => authenticate(req))).rejects.toMatchObject({ status: 401 })

describe("the API's access tokens", () => {
  it('are taken as a bearer token, as the person in the organization they allowed the client in, keeping the client', async () => {
    const session = await withApi(request(`Bearer ${await token()}`))
    expect(session).toMatchObject({ user: { id: 'ana', roles: ['sales'] }, tenant: '1', organization: { id: '1', role: 'member' }, client: { id: 'watch' } })
  })

  it("leave the app's own tokens to their own check", async () => {
    const session = await withApi(request(`Bearer ${await token({ aud: issuer, typ: 'JWT' })}`))
    expect(session).toMatchObject({ user: { id: 'ana', roles: ['sales'] } })
    expect(session).not.toHaveProperty('client')
  })

  it("refuse an MCP token, which only MCP's write approval guards", async () => {
    await refused(withApi, request(`Bearer ${await token({ aud: mcpResource })}`))
  })

  it("are refused by the MCP endpoint", async () => {
    await refused(withApi.forAudience(mcpResource), request(`Bearer ${await token()}`))
  })

  it('refuse an expired, forged or malformed token, and one of a client the person does not allow', async () => {
    await refused(withApi, request(`Bearer ${await token({ exp: Math.floor(Date.now() / 1000) - 60 })}`))
    await refused(withApi, request(`Bearer ${await token({ key: otherKeys.privateKey })}`))
    await refused(withApi, request(`Bearer ${(await token()).slice(0, -4)}`))
    await refused(withApi, request('Bearer not-a-token'))
    await refused(withApi, request(`Bearer ${await token({ client: 'stranger' })}`))
  })

  it('refuse a token bound to a key, which needs a proof this API does not check', async () => {
    await refused(withApi, request(`Bearer ${await token({ claims: { cnf: { jkt: 'thumbprint' } } })}`))
  })

  it('are refused while clients may not get them (`oauth.api` off)', async () => {
    const without = betterAuthAuthenticator({ auth: authOver(fakeAdapter(tables()).adapter), organizations: true })
    await refused(without, request(`Bearer ${await token()}`))
  })
})
