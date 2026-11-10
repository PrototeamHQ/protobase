import { decodeJwt } from 'jose'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mcpStores, origin, resource as mcpResource, serveMcp, type McpStores, type Tokens } from './support/mcp-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

let stores: McpStores
beforeAll(async () => { stores = await mcpStores() })
afterAll(async () => { await stores.fixture.db.destroy() })

const apiResource = `${origin}/api`

type Served = Awaited<ReturnType<typeof serveMcp>>

const served = (api = true) => serveMcp(stores, { auth: { oauth: { api } } })

// A client that registers, has Ana sign in and allow it on the connect page, and asks for the API's tokens.
const apiGrant = async (app: Served) => {
  const clientId = await app.register()
  const cookie = await app.signIn('ana@example.com')
  const response = await app.exchange(clientId, await app.connect(cookie, clientId, { resource: apiResource }))
  expect(response.status, await response.clone().text()).toBe(200)
  return { clientId, cookie, tokens: (await response.json()) as Tokens }
}

const api = (app: Served, token: string, path: string, body?: object) => app.request(`/api/v1/${path}`, { headers: { authorization: `Bearer ${token}` }, ...(body && { body }) })

describe("an OAuth client's access token for the API", () => {
  it("reads and writes the API as the person who allowed the client, as the person's own token does", async () => {
    const app = await served()
    const { cookie, tokens } = await apiGrant(app)
    expect(decodeJwt(tokens.access_token)).toMatchObject({ aud: apiResource, role: 'sales' })
    const own = ((await (await app.request('/api/auth/token', { cookie })).json()) as { token: string }).token

    const read = await api(app, tokens.access_token, 'organizations?order_by=id&page_size=1')
    expect(read.status, await read.clone().text()).toBe(200)
    expect(await read.json()).toEqual(await (await api(app, own, 'organizations?order_by=id&page_size=1')).json())
    const written = await api(app, tokens.access_token, 'organizations', { name: 'Initech' })
    expect(written.status, await written.clone().text()).toBe(201)
  })

  it('keeps working through a refresh, and stops at once when the person disconnects the client', async () => {
    const app = await served()
    const { clientId, cookie, tokens } = await apiGrant(app)
    const refreshed = (await (await app.refresh(clientId, tokens.refresh_token!)).json()) as Tokens
    expect(decodeJwt(refreshed.access_token).aud).toBe(apiResource)
    expect((await api(app, refreshed.access_token, 'organizations?page_size=1')).status).toBe(200)

    expect((await app.request('/api/auth/account/connected-apps/disconnect', { cookie, body: { clientId } })).status).toBe(200)
    expect((await api(app, refreshed.access_token, 'organizations?page_size=1')).status).toBe(401)
  })

  it("is refused by the MCP endpoint, and an MCP token by the API, whose writes MCP's approval guards", async () => {
    const app = await served()
    const { tokens } = await apiGrant(app)
    await expect(Promise.resolve().then(() => app.authenticate.forAudience(mcpResource)(new Request(mcpResource, { method: 'POST', headers: { authorization: `Bearer ${tokens.access_token}` } })))).rejects.toMatchObject({ status: 401 })
    const mcp = await app.grant('ana@example.com')
    expect(decodeJwt(mcp.tokens.access_token).aud).toBe(mcpResource)
    expect((await api(app, mcp.tokens.access_token, 'organizations?page_size=1')).status).toBe(401)
  })

  it('cannot be asked for without oauth.api, at authorize or the code exchange', async () => {
    const app = await served(false)
    const clientId = await app.register()
    const cookie = await app.signIn('ana@example.com')
    const { location } = await app.authorize(cookie, clientId, { resource: apiResource })
    expect(new URL(location, origin).searchParams.get('error')).toBe('invalid_target')
    const exchanged = await app.exchange(clientId, await app.connect(cookie, clientId), {}, { resource: apiResource })
    expect(exchanged.status).toBe(400)
    expect(await exchanged.json()).toMatchObject({ error: 'invalid_target' })
  })
})
