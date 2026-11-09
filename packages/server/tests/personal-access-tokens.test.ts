import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { setUserRole } from '../src/better-auth/users'
import { testClock } from '../../../test-support/sql-snapshot'
import { mcpStores, serveMcp, type McpStores } from './support/mcp-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

let stores: McpStores
beforeAll(async () => { stores = await mcpStores() })
afterAll(async () => { await stores.fixture.db.destroy() })

const prefix = 'test_'

type Served = Awaited<ReturnType<typeof serveMcp>>
type Created = { token: string; personalAccessToken: { id: string; name: string; role: string; createdAt: string; expiresAt?: string; lastUsedAt?: string } }

const served = () => serveMcp(stores, { auth: { personalAccessTokens: { prefix } } })

const create = async (app: Served, cookie: string, body: object = { name: 'Weekly invoices' }) => {
  const response = await app.request('/api/auth/account/personal-access-tokens/create', { cookie, body })
  expect(response.status, await response.clone().text()).toBe(200)
  return (await response.json()) as Created
}

const listed = async (app: Served, cookie: string) => ((await (await app.request('/api/auth/account/personal-access-tokens', { cookie })).json()) as { tokens: Created['personalAccessToken'][] }).tokens

const api = (app: Served, token: string, path: string, body?: object) =>
  app.request(`/api/v1/${path}`, { headers: { authorization: `Bearer ${token}` }, ...(body && { body }) })

describe('a personal access token', () => {
  it('is made on the account page, shown once, and reads and writes the API as its user until revoked', async () => {
    const app = await served()
    const cookie = await app.signIn('ana@example.com')
    const { token, personalAccessToken } = await create(app, cookie, { name: 'Weekly invoices', expiresInDays: 30 })
    expect(token).toMatch(/^test_[0-9A-Za-z]{46}$/)
    expect(personalAccessToken).toEqual({ id: expect.any(String), name: 'Weekly invoices', role: 'sales', createdAt: testClock.toISOString(), expiresAt: new Date(testClock.getTime() + 30 * 86_400_000).toISOString() })

    const read = await api(app, token, 'organizations?order_by=id&page_size=1')
    expect(read.status, await read.clone().text()).toBe(200)
    const written = await api(app, token, 'organizations', { name: 'Initech' })
    expect(written.status, await written.clone().text()).toBe(201)

    // The list never holds the token, and notes when it was last used.
    expect(await listed(app, cookie)).toEqual([{ ...personalAccessToken, lastUsedAt: testClock.toISOString() }])

    const revoked = await app.request('/api/auth/account/personal-access-tokens/revoke', { cookie, body: { id: personalAccessToken.id } })
    expect(revoked.status).toBe(200)
    expect((await api(app, token, 'organizations?page_size=1')).status).toBe(401)
    expect(await listed(app, cookie)).toEqual([])
  })

  it('leaves only its hash in the store', async () => {
    const app = await served()
    const { token } = await create(app, await app.signIn('ana@example.com'))
    const { rows: tables } = await app.store.query<{ name: string }>(`select table_name as name from information_schema.tables where table_schema = current_schema() and table_type = 'BASE TABLE' order by 1`)
    // Postgres searches each table, so only the counts are read, never a row's times.
    for (const { name } of tables) {
      const { rows } = await app.store.query<{ found: number }>(`select count(*)::int as found from "${name}" t where strpos(row_to_json(t)::text, $1) > 0`, [token.slice(prefix.length, -6)])
      expect(rows, name).toEqual([{ found: 0 }])
    }
    const { rows } = await app.store.query<{ token_hash: string }>('select token_hash from personal_access_token')
    expect(rows).toEqual([{ token_hash: expect.stringMatching(/^[0-9a-f]{64}$/) }])
  })

  it('stops once it expired, its user is banned, or the role it carries is taken away', async () => {
    const app = await served()
    const cookie = await app.signIn('ana@example.com')
    const expiring = await create(app, cookie, { name: 'Expiring', expiresInDays: 1 })
    await app.store.query('update personal_access_token set expires_at = $1 where id = $2', [new Date(testClock.getTime() - 1000), expiring.personalAccessToken.id])
    expect((await api(app, expiring.token, 'organizations?page_size=1')).status).toBe(401)

    const asSales = await create(app, cookie, { name: 'As sales' })
    expect((await api(app, asSales.token, 'organizations?page_size=1')).status).toBe(200)
    await setUserRole(app.auth, { email: 'ana@example.com', role: 'accountant' })
    expect((await api(app, asSales.token, 'organizations?page_size=1')).status).toBe(401)

    const bo = await create(app, await app.signIn('bo@example.com'), { name: "Bo's script" })
    expect((await api(app, bo.token, 'organizations?page_size=1')).status).toBe(200)
    const { internalAdapter } = await app.auth.$context
    await internalAdapter.updateUser(await app.userId('bo@example.com'), { banned: true })
    expect((await api(app, bo.token, 'organizations?page_size=1')).status).toBe(401)
  })

  it('is refused with a wrong checksum or an unknown hash', async () => {
    const app = await served()
    const { token } = await create(app, await app.signIn('ana@example.com'))
    const changed = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`
    expect((await api(app, changed, 'organizations?page_size=1')).status).toBe(401)
    await app.store.query('delete from personal_access_token')
    expect((await api(app, token, 'organizations?page_size=1')).status).toBe(401)
  })

  it('works as a bearer token at the MCP endpoint', async () => {
    const app = await served()
    const { token } = await create(app, await app.signIn('ana@example.com'))
    const response = await app.request('/api/mcp', {
      body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      headers: { host: 'localhost:5173', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25', authorization: `Bearer ${token}` },
    })
    expect(response.status, await response.clone().text()).toBe(200)
  })

  it('is not offered without the setting', async () => {
    const app = await serveMcp(stores)
    const cookie = await app.signIn('ana@example.com')
    expect((await app.request('/api/auth/account/personal-access-tokens/create', { cookie, body: { name: 'Script' } })).status).toBe(404)
    expect(await (await app.request('/api/auth/status')).json()).not.toHaveProperty('personalAccessTokens')
  })
})
