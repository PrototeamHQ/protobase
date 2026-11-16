import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mcpStores, origin, type McpStores } from './support/mcp-app'
import { phoneCallback, serveOpenId } from './support/openid-provider-app'

// The origins the operator lets the token exchange issue ID tokens for by pattern: no app there is registered, the ID
// token's audience is the origin itself, and no browser is ever sent there.

let stores: McpStores
beforeAll(async () => {
  stores = await mcpStores()
})
afterAll(async () => {
  await stores.fixture.db.destroy()
})

const shop = 'https://shop.example.app'

const signedInPhone = async () => {
  const app = await serveOpenId(stores, { openIdProvider: { audiences: ['https://*.example.app'] } })
  const phone = await app.registerPhone()
  const tokens = await app.codeFlow(phone, 'ana@example.com', phoneCallback, 'openid email profile offline_access')
  return { app, phone, tokens }
}

describe('an origin of the audiences', () => {
  it('gets an ID token for that origin alone from the phone, with no client registered for it', async () => {
    const { app, phone, tokens } = await signedInPhone()
    const exchanged = await app.exchange(phone, tokens.access_token, shop)
    expect(exchanged.status, await exchanged.clone().text()).toBe(200)
    const body = (await exchanged.json()) as Record<string, unknown>
    expect(body).toMatchObject({ issued_token_type: 'urn:ietf:params:oauth:token-type:id_token', token_type: 'N_A', expires_in: 300 })
    const claims = await app.verified(body.access_token as string, shop)
    expect(claims).toMatchObject({ iss: origin, aud: shop, sub: await app.userId('ana@example.com'), email: 'ana@example.com', email_verified: true })
    expect(claims.exp! - claims.iat!).toBe(300)
    expect(typeof claims.jti).toBe('string')
    // The app at that origin takes it as its own; any other app refuses it.
    expect(await app.signInTokenClaims(body.access_token as string, shop)).toMatchObject({ sub: claims.sub })
    expect(await app.signInTokenClaims(body.access_token as string, 'https://other.example.app')).toBeUndefined()
  })

  it('is matched as an origin, so another host, scheme, label, port or a look-alike gets nothing', async () => {
    const { app, phone, tokens } = await signedInPhone()
    for (const audience of [
      'https://example.app',
      'https://a.b.example.app',
      'https://example.app.evil.com',
      'https://evilexample.app',
      'http://shop.example.app',
      'https://shop.example.app:8443',
      'https://user@shop.example.app',
      'https://shop.example.app/',
      'https://shop.example.app/path',
      'https://SHOP.example.app',
    ]) {
      const refused = await app.exchange(phone, tokens.access_token, audience)
      expect(refused.status, audience).toBe(400)
      expect(await refused.json()).toMatchObject({ error: 'invalid_target' })
    }
  })

  it('is never sent a browser: not as a client id, a redirect URI, or a registered one', async () => {
    const { app, phone } = await signedInPhone()
    const cookie = await app.signIn('ana@example.com')
    for (const { clientId, redirect_uri } of [
      { clientId: shop, redirect_uri: `${shop}/api/auth/callback/oidc` },
      { clientId: phone.clientId, redirect_uri: `${shop}/api/auth/callback/oidc` },
    ]) {
      const { response, location } = await app.authorize(cookie, clientId, { redirect_uri })
      expect(response.status).toBe(400)
      expect(location).toBe('')
    }
    const registered = await app.request('/api/auth/openid-provider/clients', { cookie: await app.rootCookie(), body: { name: 'Shop', redirectUris: [`${shop}/api/auth/callback/oidc`], type: 'confidential' } })
    expect(registered.status).toBe(400)
    expect(await registered.json()).toMatchObject({ code: 'REDIRECT_ON_AUDIENCE_HOST' })
  })
})
