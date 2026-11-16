import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildAuth } from '../src/better-auth/create-auth'
import { idTokenUser } from '../src/better-auth/platform-sign-in'
import { mcpStores, origin, secret, type McpStores } from './support/mcp-app'
import { phoneCallback, serveOpenId, webCallback } from './support/openid-provider-app'

// The app as the OpenID provider of other apps: only the clients its admin registers get an ID token, which says who
// the person is, and a phone app the admin lets exchange gets ID tokens for the other clients from its own token.

let stores: McpStores
beforeAll(async () => {
  stores = await mcpStores()
})
afterAll(async () => {
  await stores.fixture.db.destroy()
})

const idTokenType = 'urn:ietf:params:oauth:token-type:id_token'

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
    const created = (await app.auth.api.adminCreateOAuthClient({ headers: new Headers({ cookie: await app.signIn('root@example.com') }), body: { redirect_uris: [webCallback], scope: 'openid email profile', skip_consent: true } })) as { client_id: string; client_secret: string }
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
    const cookie = await app.signIn('root@example.com')
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

describe('the token exchange', () => {
  const signedInPhone = async () => {
    const app = await serveOpenId(stores)
    const shop = await app.registerWeb()
    const phone = await app.registerPhone()
    const tokens = await app.codeFlow(phone, 'ana@example.com', phoneCallback, 'openid email profile offline_access')
    return { app, shop, phone, tokens }
  }

  it("gives the phone an ID token for another client, for that client alone, living five minutes, and nothing else", async () => {
    const { app, shop, phone, tokens } = await signedInPhone()
    const exchanged = await app.exchange(phone, tokens.access_token, shop.clientId)
    expect(exchanged.status, await exchanged.clone().text()).toBe(200)
    const body = (await exchanged.json()) as Record<string, unknown>
    expect(body).toMatchObject({ issued_token_type: idTokenType, token_type: 'N_A', expires_in: 300 })
    expect(body.refresh_token).toBeUndefined()
    expect(body.id_token).toBeUndefined()
    const claims = await app.verified(body.access_token as string, shop.clientId)
    expect(claims).toMatchObject({ iss: origin, aud: shop.clientId, sub: await app.userId('ana@example.com'), email: 'ana@example.com', email_verified: true })
    expect(claims.exp! - claims.iat!).toBe(300)
    // The other app's token sign-in takes it, as it checks every token posted to it.
    expect(await app.signInTokenClaims(body.access_token as string, shop.clientId)).toMatchObject({ sub: claims.sub, email: 'ana@example.com' })
    expect(await app.signInTokenClaims(body.access_token as string, phone.clientId)).toBeUndefined()
    // The access token minted with it for the other client is gone.
    expect((await app.store.query(`select 1 from oauth_access_token where client_id = $1`, [shop.clientId])).rows).toHaveLength(0)
  })

  it('takes only a live access token the phone itself was given', async () => {
    const { app, shop, phone, tokens } = await signedInPhone()
    const other = await app.register({ name: 'Other phone', redirectUris: [phoneCallback], type: 'public', exchange: true })
    const othersToken = (await app.codeFlow(other, 'ana@example.com', phoneCallback, 'openid email profile offline_access')).access_token
    for (const subject of [tokens.id_token, tokens.refresh_token!, othersToken, 'made-up-token']) {
      const refused = await app.exchange(phone, subject, shop.clientId)
      expect(refused.status).toBe(400)
      expect(await refused.json()).toMatchObject({ error: 'invalid_grant' })
    }
    expect((await app.request('/api/auth/oauth2/revoke', { form: { token: tokens.access_token, token_type_hint: 'access_token', client_id: phone.clientId }, from: null })).status).toBe(200)
    expect(await (await app.exchange(phone, tokens.access_token, shop.clientId)).json()).toMatchObject({ error: 'invalid_grant' })
  })

  it('refuses a client the operator did not let exchange', async () => {
    const { app, shop } = await signedInPhone()
    const plain = await app.register({ name: 'Plain phone', redirectUris: [phoneCallback], type: 'public' })
    const tokens = await app.codeFlow(plain, 'ana@example.com', phoneCallback)
    const refused = await app.exchange(plain, tokens.access_token, shop.clientId)
    expect(refused.status).toBe(400)
    expect(await refused.json()).toMatchObject({ error: 'unauthorized_client' })
  })

  it('gives an ID token only for another client the operator registered', async () => {
    const { app, phone, tokens } = await signedInPhone()
    const created = (await app.auth.api.adminCreateOAuthClient({ headers: new Headers({ cookie: await app.signIn('root@example.com') }), body: { redirect_uris: [webCallback], scope: 'openid email profile', skip_consent: true } })) as { client_id: string }
    for (const audience of ['nobody-registered-me', phone.clientId, created.client_id]) {
      const refused = await app.exchange(phone, tokens.access_token, audience)
      expect(refused.status).toBe(400)
      const body = (await refused.json()) as Record<string, unknown>
      expect(body).toMatchObject({ error: 'invalid_target' })
      expect(body.access_token).toBeUndefined()
    }
  })

  it('gives an ID token only, from an access token only', async () => {
    const { app, shop, phone, tokens } = await signedInPhone()
    const forms: Record<string, string>[] = [{ requested_token_type: 'urn:ietf:params:oauth:token-type:access_token' }, { requested_token_type: '' }, { subject_token_type: idTokenType }]
    for (const form of forms) {
      const refused = await app.exchange(phone, tokens.access_token, shop.clientId, form)
      expect(refused.status).toBe(400)
      expect(await refused.json()).toMatchObject({ error: 'invalid_request' })
    }
  })

  it('refuses a banned person, and one whose address is not verified', async () => {
    const { app, shop, phone, tokens } = await signedInPhone()
    await app.store.query(`update "user" set email_verified = false where email = 'ana@example.com'`)
    expect(await (await app.exchange(phone, tokens.access_token, shop.clientId)).json()).toMatchObject({ error: 'invalid_grant', error_description: 'the address is not verified' })
    await app.store.query(`update "user" set email_verified = true, banned = true where email = 'ana@example.com'`)
    expect(await (await app.exchange(phone, tokens.access_token, shop.clientId)).json()).toMatchObject({ error: 'invalid_grant' })
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
