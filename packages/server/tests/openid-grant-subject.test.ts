import { decodeJwt } from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mcpStores, type McpStores } from './support/mcp-app'
import { phoneCallback, serveOpenId } from './support/openid-provider-app'

// The OpenID provider with `subject: 'grant'`: an ID token names the client's grant, never the person, so each fresh
// sign-in of a phone app is a device of its own to the apps that take its tokens.

let stores: McpStores
beforeAll(async () => {
  stores = await mcpStores()
})
afterAll(async () => {
  await stores.fixture.db.destroy()
})

const signedInPhone = async () => {
  const app = await serveOpenId(stores, { openIdProvider: { subject: 'grant' } })
  const shop = await app.registerWeb()
  const phone = await app.registerPhone()
  const signIn = () => app.codeFlow(phone, 'ana@example.com', phoneCallback, 'openid email profile offline_access')
  return { app, shop, phone, signIn }
}

describe('grant subjects', () => {
  it('give each fresh sign-in of one person a subject of its own, never their id', async () => {
    const { app, signIn } = await signedInPhone()
    const first = decodeJwt((await signIn()).id_token).sub
    const second = decodeJwt((await signIn()).id_token).sub
    expect(first).toEqual(expect.any(String))
    expect(second).not.toBe(first)
    expect([first, second]).not.toContain(await app.userId('ana@example.com'))
  })

  it("keep the grant's subject across its refresh tokens and token exchanges", async () => {
    const { app, shop, phone, signIn } = await signedInPhone()
    const tokens = await signIn()
    const sub = decodeJwt(tokens.id_token).sub
    const refreshed = await app.token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token!, client_id: phone.clientId })
    expect(refreshed.status, await refreshed.clone().text()).toBe(200)
    const renewed = (await refreshed.json()) as { access_token: string; id_token: string }
    expect((await app.verified(renewed.id_token, phone.clientId)).sub).toBe(sub)
    for (const accessToken of [tokens.access_token, renewed.access_token]) {
      const exchanged = await app.exchange(phone, accessToken, shop.clientId)
      expect(exchanged.status, await exchanged.clone().text()).toBe(200)
      const claims = await app.verified(((await exchanged.json()) as { access_token: string }).access_token, shop.clientId)
      expect(claims).toMatchObject({ sub, aud: shop.clientId, email: 'ana@example.com', email_verified: true })
    }
  })
})

describe('the device name', () => {
  it('goes from the token exchange into the ID token, cut to 64 characters', async () => {
    const { app, shop, phone, signIn } = await signedInPhone()
    const tokens = await signIn()
    const named = async (deviceName: string) => {
      const exchanged = await app.exchange(phone, tokens.access_token, shop.clientId, { device_name: deviceName })
      expect(exchanged.status, await exchanged.clone().text()).toBe(200)
      return (await app.verified(((await exchanged.json()) as { access_token: string }).access_token, shop.clientId)).device_name
    }
    expect(await named(" Ana's phone ")).toBe("Ana's phone")
    expect(await named('x'.repeat(100))).toBe('x'.repeat(64))
    expect(await named(' ')).toBeUndefined()
  })
})
