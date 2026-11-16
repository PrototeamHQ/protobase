import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildAuth } from '../src/better-auth/create-auth'
import { idTokenUser } from '../src/better-auth/platform-sign-in'
import { mcpStores, origin, secret, type McpStores } from './support/mcp-app'
import { phoneCallback, serveOpenId, webCallback } from './support/openid-provider-app'

// The app as the OpenID provider of other apps: only the clients its admin registers get an ID token, which says who
// the person is. The token exchange is in openid-token-exchange.test.ts.

let stores: McpStores
beforeAll(async () => {
  stores = await mcpStores()
})
afterAll(async () => {
  await stores.fixture.db.destroy()
})

describe('the browser sign-in of a registered client', () => {
  it('gives it an ID token for its own id, with who the person is, without asking them to allow it', async () => {
    const app = await serveOpenId(stores)
    const shop = await app.registerWeb()
    // Signed out, the browser goes to the connect page to sign in, which picks the request up and goes on.
    const { location: signInFirst } = await app.authorize(undefined, shop.clientId)
    expect(signInFirst.startsWith('/-/connect?')).toBe(true)
    const cookie = await app.signIn('ana@example.com')
    const resumed = await app.request('/api/auth/oauth2/continue', { cookie, body: { postLogin: true, oauth_query: new URL(signInFirst, origin).search.slice(1) } })
    const { url } = (await resumed.json()) as { url: string }
    expect(url.startsWith(`${webCallback}?`)).toBe(true)

    const tokens = await app.codeFlow(shop)
    const claims = await app.verified(tokens.id_token, shop.clientId)
    expect(claims).toMatchObject({ iss: origin, aud: shop.clientId, sub: await app.userId('ana@example.com'), email: 'ana@example.com', email_verified: true, nonce: 'n0nce' })
    expect(claims.exp! - claims.iat!).toBe(300)
    // Another Protobase app signing in through this provider's pages reads the person from the token as it is.
    expect(idTokenUser(tokens.id_token, origin)).toMatchObject({ id: claims.sub, email: 'ana@example.com', emailVerified: true })
  })

  it('publishes its configuration at the issuer, as a client discovers it', async () => {
    const app = await serveOpenId(stores)
    const discovery = (await (await app.request('/.well-known/openid-configuration', { from: null })).json()) as Record<string, unknown>
    expect(discovery).toMatchObject({ issuer: origin, authorization_endpoint: `${origin}/api/auth/oauth2/authorize`, token_endpoint: `${origin}/api/auth/oauth2/token`, jwks_uri: `${origin}/api/auth/jwks` })
    expect(discovery.registration_endpoint).toBeUndefined()
    // The algorithm a receiving app's token sign-in takes a token with is one the discovery names.
    expect(discovery.id_token_signing_alg_values_supported).toContain('EdDSA')
  })

  it('refuses an unregistered client, and never sends the browser anywhere', async () => {
    const app = await serveOpenId(stores)
    const { response, location } = await app.authorize(await app.signIn('ana@example.com'), 'nobody-registered-me')
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_client' })
    expect(location).toBe('')
  })

  it('refuses a redirect URI the client did not register, and does not redirect to it', async () => {
    const app = await serveOpenId(stores)
    const shop = await app.registerWeb()
    const cookie = await app.signIn('ana@example.com')
    for (const redirect_uri of ['https://evil.example/callback', `${webCallback}/more`, webCallback.replace('https://', 'http://')]) {
      const { location } = await app.authorize(cookie, shop.clientId, { redirect_uri })
      expect(location.startsWith(redirect_uri)).toBe(false)
      expect(location).not.toMatch(/[?&]code=/)
    }
  })

  it('refuses a client in the store the operator did not register, at authorize and at the token endpoint', async () => {
    const app = await serveOpenId(stores)
    const created = (await app.auth.api.adminCreateOAuthClient({ headers: new Headers({ cookie: await app.rootCookie() }), body: { redirect_uris: [webCallback], scope: 'openid email profile', skip_consent: true } })) as { client_id: string; client_secret: string }
    const { response } = await app.authorize(await app.signIn('ana@example.com'), created.client_id)
    expect(response.status).toBe(400)
    const refused = await app.token({ grant_type: 'authorization_code', code: 'any', redirect_uri: webCallback, code_verifier: 'v' }, app.basic({ clientId: created.client_id, clientSecret: created.client_secret }))
    expect(refused.status).toBe(400)
    expect(await refused.json()).toMatchObject({ error: 'invalid_client' })
  })
})

describe('the operator API', () => {
  it('is for admins only', async () => {
    const app = await serveOpenId(stores)
    const cookie = await app.signIn('ana@example.com')
    const refused = await app.request('/api/auth/openid-provider/clients', { cookie, body: { name: 'Shop', redirectUris: [webCallback], type: 'confidential' } })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'ADMIN_ONLY' })
    expect((await app.request('/api/auth/openid-provider/clients', { cookie })).status).toBe(403)
  })

  it('registers a client once with its secret, lists it, and deletes it with what it was given', async () => {
    const app = await serveOpenId(stores)
    const shop = await app.registerWeb()
    const phone = await app.registerPhone()
    expect(shop.clientSecret).toBeTruthy()
    expect(phone.clientSecret).toBeUndefined()
    const cookie = await app.rootCookie()
    expect(await (await app.request('/api/auth/openid-provider/clients', { cookie })).json()).toEqual(
      expect.arrayContaining([
        { clientId: shop.clientId, name: 'Shop', redirectUris: [webCallback], type: 'confidential', exchange: false },
        { clientId: phone.clientId, name: 'Phone', redirectUris: [phoneCallback], type: 'public', exchange: true },
      ]),
    )
    const { refresh_token } = await app.codeFlow(phone, 'ana@example.com', phoneCallback, 'openid email profile offline_access')
    expect((await app.request('/api/auth/openid-provider/clients/delete', { cookie, body: { clientId: phone.clientId } })).status).toBe(200)
    const refreshed = await app.token({ grant_type: 'refresh_token', refresh_token: refresh_token!, client_id: phone.clientId })
    expect(refreshed.status).toBe(400)
    expect((await (await app.request('/api/auth/openid-provider/clients', { cookie })).json()) as unknown[]).toHaveLength(1)
  })
})

describe('without the OpenID provider', () => {
  it('serves no configuration, operator API or token endpoint', async () => {
    const store = await stores.migrated.clone()
    const auth = await buildAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: origin, secret, mailer: false, roles: ['admin', 'sales'], defaultRole: 'sales' })
    expect(auth.openIdProvider).toBe(false)
    expect((await auth.handler(new Request(`${origin}/api/auth/oauth2/token`, { method: 'POST' }))).status).toBe(404)
    expect((await auth.handler(new Request(`${origin}/api/auth/openid-provider/clients`))).status).toBe(404)
  })

  it('is refused together with MCP, whose clients register themselves', async () => {
    await expect(buildAuth({ database: { dialect: stores.migrated.dialect, type: 'postgres' }, baseURL: origin, secret, mailer: false, mcp: true, openIdProvider: true })).rejects.toThrow(/auth.openIdProvider cannot be on together with auth.mcp/)
  })
})
