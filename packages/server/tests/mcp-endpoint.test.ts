import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AdminOptions } from '../src/admin-options'
import { mcpStores, origin, serveMcp, type McpStores } from './support/mcp-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

let stores: McpStores
beforeAll(async () => { stores = await mcpStores() })
afterAll(async () => { await stores.fixture.db.destroy() })

const host = 'localhost:5173'
const metadataUrl = `${origin}/.well-known/oauth-protected-resource/api/mcp`

type Served = Awaited<ReturnType<typeof serveMcp>>

// The JSON-RPC answer, sent as JSON or as one server-sent event.
const resultOf = async (response: Response) => {
  const text = await response.text()
  const data = text.trimStart().startsWith('{') ? text : text.split('\n').find((line) => line.startsWith('data: '))!.slice('data: '.length)
  const message = JSON.parse(data) as { result?: Record<string, unknown>; error?: unknown }
  expect(message.error).toBeUndefined()
  return message.result!
}

/** A JSON-RPC request to the endpoint as a 2025 client sends it, without a session. */
const rpc = (app: Served, token: string | undefined, method: string, params: object = {}, headers: Record<string, string> = {}) =>
  app.request('/api/mcp', {
    body: { jsonrpc: '2.0', id: 1, method, params },
    headers: { host, accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25', ...(token && { authorization: `Bearer ${token}` }), ...headers },
  })

const toolNames = async (app: Served, token: string) => ((await resultOf(await rpc(app, token, 'tools/list'))).tools as Array<{ name: string }>).map((tool) => tool.name)

const call = async (app: Served, token: string, name: string, args: object) => {
  const result = await resultOf(await rpc(app, token, 'tools/call', { name, arguments: args }))
  return JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as unknown
}

const served = async (admin?: AdminOptions, email = 'ana@example.com') => {
  const app = await serveMcp(stores, { ...(admin && { admin }) })
  const { cookie, tokens } = await app.grant(email)
  const own = ((await (await app.request('/api/auth/token', { cookie })).json()) as { token: string }).token
  return { app, mcp: tokens.access_token, own }
}

const records = ['list_resources', 'list_records', 'get_record']

describe('the MCP endpoint', () => {
  it('asks for a token with a challenge naming its metadata, and refuses the app\'s own tokens', async () => {
    const { app, own } = await served()
    const missing = await rpc(app, undefined, 'tools/list')
    expect(missing.status).toBe(401)
    expect(missing.headers.get('www-authenticate')).toContain(`resource_metadata="${metadataUrl}"`)
    expect((await app.request(metadataUrl)).status).toBe(200)
    expect((await rpc(app, own, 'tools/list')).status).toBe(401)
  })

  it('refuses a request addressed to another host', async () => {
    const { app, mcp } = await served()
    expect((await rpc(app, mcp, 'tools/list', {}, { host: 'evil.example' })).status).toBe(403)
  })

  it('answers a preflight from any origin', async () => {
    const { app } = await served()
    const preflight = await app.request('/api/mcp', { method: 'OPTIONS', from: 'https://assistant.example', headers: { host, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, mcp-protocol-version' } })
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('offers the record tools, read-only, and SQL only to an admin with mcp.sql on', async () => {
    const off = await served()
    const tools = (await resultOf(await rpc(off.app, off.mcp, 'tools/list'))).tools as Array<{ name: string; annotations?: { readOnlyHint?: boolean } }>
    expect(tools.map((tool) => [tool.name, tool.annotations?.readOnlyHint])).toEqual(records.map((name) => [name, true]))
    const on = await served({ mcp: { sql: true } })
    expect(await toolNames(on.app, on.mcp)).toEqual(records)
    const root = await served({ mcp: { sql: true } }, 'root@example.com')
    expect(await toolNames(root.app, root.mcp)).toEqual([...records, 'run_read_only_query'])
    const rootOff = await served(undefined, 'root@example.com')
    expect(await toolNames(rootOff.app, rootOff.mcp)).toEqual(records)
  })

  it('finds and reads records as the API gives them to the same person, refusals included', async () => {
    const { app, mcp, own } = await served()
    const rest = async (path: string) => app.request(`/api/v1/${path}`, { headers: { authorization: `Bearer ${own}` } })
    const page = (await call(app, mcp, 'list_records', { resource: 'organizations', order_by: 'id desc', page_size: 1 })) as { items: Array<{ id: number }>; next_page_token: string }
    expect(page).toEqual(await (await rest('organizations?order_by=id%20desc&page_size=1')).json())
    const next = await call(app, mcp, 'list_records', { resource: 'organizations', order_by: 'id desc', page_size: 1, page_token: page.next_page_token })
    expect(next).toEqual(await (await rest(`organizations?order_by=id%20desc&page_size=1&page_token=${page.next_page_token}`)).json())
    const { id } = page.items[0]!
    const read = (await call(app, mcp, 'get_record', { resource: 'organizations', key: String(id) })) as { record: unknown; etag: string }
    const one = await rest(`organizations/${id}`)
    // The API's record carries its ETag and permissions besides its fields.
    const { id: restId, name } = (await one.json()) as { id: number; name: string }
    expect(read).toEqual({ record: { id: restId, name }, etag: one.headers.get('etag') })
    // Tenant-scoped, and Ana works in no organization.
    const refused = await rest('companies?page_size=1')
    expect(refused.status).toBe(403)
    expect(await call(app, mcp, 'list_records', { resource: 'companies' })).toEqual({ error: 'tenant-required', message: ((await refused.json()) as { detail: string }).detail })
  })

  it('lists the resources the person may read, with their fields', async () => {
    const { app, mcp } = await served()
    const described = (await call(app, mcp, 'list_resources', {})) as Array<{ name: string; key: string[]; fields: Array<{ name: string }> }>
    expect(described.map((entry) => entry.name)).toEqual(['organizations', 'companies', 'labels', 'lineItems', 'events'])
    expect(described[0]).toEqual({
      name: 'organizations',
      key: ['id'],
      fields: [
        { name: 'id', type: 'integer', optional: false, read_only: true, filterable: true, sortable: true },
        { name: 'name', type: 'text', optional: false, read_only: false, filterable: false, sortable: false },
      ],
    })
  })
})
