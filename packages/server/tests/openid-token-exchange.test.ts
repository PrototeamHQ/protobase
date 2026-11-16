import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mcpStores, origin, type McpStores } from './support/mcp-app'
import { phoneCallback, serveOpenId } from './support/openid-provider-app'

// The token exchange of the OpenID provider: a phone app the admin lets exchange gets an ID token for another
// registered client from its own access token, and nothing else gets anything.

let stores: McpStores
beforeAll(async () => {
  stores = await mcpStores()
})
afterAll(async () => {
  await stores.fixture.db.destroy()
})

const idTokenType = 'urn:ietf:params:oauth:token-type:id_token'

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
})
