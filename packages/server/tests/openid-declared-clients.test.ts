import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DeclaredClient } from '../src/better-auth/openid-provider/declared-clients'
import { mcpStores, origin, type McpStores } from './support/mcp-app'
import { phoneCallback, serveOpenId, webCallback } from './support/openid-provider-app'

// The clients an app declares in its config: served under the ids written there with no admin registering them, as a
// registered client is, and refused once the config no longer declares them.

let stores: McpStores
beforeAll(async () => {
  stores = await mcpStores()
})
afterAll(async () => {
  await stores.fixture.db.destroy()
})

const phone: DeclaredClient = { clientId: 'example-phone', name: 'Phone', redirectUris: [phoneCallback], type: 'public', exchange: true }
const shop: DeclaredClient = { clientId: 'example-shop', name: 'Shop', redirectUris: [webCallback], type: 'public' }
const declaring = (...clients: DeclaredClient[]) => ({ openIdProvider: { clients } })
const offline = 'openid email profile offline_access'

describe('a declared client', () => {
  it('signs a person in with PKCE under its declared id, and refreshes and exchanges its tokens', async () => {
    const app = await serveOpenId(stores, declaring(phone, shop))
    const tokens = await app.codeFlow(phone, 'ana@example.com', phoneCallback, offline)
    expect(await app.verified(tokens.id_token, phone.clientId)).toMatchObject({ iss: origin, aud: phone.clientId, email: 'ana@example.com' })

    const refreshed = await app.token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token!, client_id: phone.clientId })
    expect(refreshed.status, await refreshed.clone().text()).toBe(200)

    const exchanged = await app.exchange(phone, tokens.access_token, shop.clientId)
    expect(exchanged.status, await exchanged.clone().text()).toBe(200)
    const { access_token: idToken } = (await exchanged.json()) as { access_token: string }
    expect(await app.verified(idToken, shop.clientId)).toMatchObject({ aud: shop.clientId, email: 'ana@example.com' })
  })

  it('may not exchange unless the config lets it', async () => {
    const app = await serveOpenId(stores, declaring(phone, shop))
    const tokens = await app.codeFlow(shop, 'ana@example.com', webCallback)
    const refused = await app.exchange(shop, tokens.access_token, phone.clientId)
    expect(refused.status).toBe(400)
    expect(await refused.json()).toMatchObject({ error: 'unauthorized_client' })
  })

  it('is refused once the config no longer declares it, with its refresh token', async () => {
    const before = await serveOpenId(stores, declaring(phone))
    const tokens = await before.codeFlow(phone, 'ana@example.com', phoneCallback, offline)
    const after = await serveOpenId(stores, declaring(), before.store)

    const { response } = await after.authorize(await after.signIn('ana@example.com'), phone.clientId, { redirect_uri: phoneCallback })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_client' })
    const refreshed = await after.token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token!, client_id: phone.clientId })
    expect(refreshed.status).toBe(400)
    expect(await refreshed.json()).toMatchObject({ error: 'invalid_client' })
  })

  it('is refused under an id an admin registered a client with too, rather than served as either', async () => {
    const before = await serveOpenId(stores)
    const registered = await before.registerPhone()
    const after = await serveOpenId(stores, declaring({ ...phone, clientId: registered.clientId }), before.store)

    const { response, location } = await after.authorize(await after.signIn('ana@example.com'), registered.clientId, { redirect_uri: phoneCallback })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_client', error_description: expect.stringContaining('both declared in the app config and registered by an admin') })
    expect(location).toBe('')
  })
})
