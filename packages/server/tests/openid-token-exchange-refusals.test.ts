import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mcpStores, type McpStores } from './support/mcp-app'
import { phoneCallback, serveOpenId, webCallback } from './support/openid-provider-app'

// What the OpenID provider's token exchange refuses: an audience that is not another registered client, a token type
// other than an access token in and an ID token out, and a person who is banned or has no verified address.

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

  it('gives an ID token only for another client the operator registered', async () => {
    const { app, phone, tokens } = await signedInPhone()
    const created = (await app.auth.api.adminCreateOAuthClient({ headers: new Headers({ cookie: await app.rootCookie() }), body: { redirect_uris: [webCallback], scope: 'openid email profile', skip_consent: true } })) as { client_id: string }
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
