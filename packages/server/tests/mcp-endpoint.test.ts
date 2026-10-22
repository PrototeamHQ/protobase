import { base64url } from 'jose'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AdminOptions } from '../src/admin-options'
import type { BetterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAdmin } from '../src/create-admin'
import { mcpHandler } from '../src/mcp/mcp-handler'
import { mcpServer } from '../src/mcp/mcp-server'
import { mcpTools } from '../src/mcp/mcp-tools'
import { authOn, mcpStores, origin, password, redirectUri, resource, serveMcp, type McpStores } from './support/mcp-app'

// Counted, so a test can tell the generic endpoint was never built.
vi.mock('../src/mcp/mcp-tools', async (real) => ({ mcpTools: vi.fn((await real<typeof import('../src/mcp/mcp-tools')>()).mcpTools) }))
vi.mock('../src/mcp/mcp-server', async (real) => ({ mcpServer: vi.fn((await real<typeof import('../src/mcp/mcp-server')>()).mcpServer) }))
vi.mock('../src/mcp/mcp-handler', async (real) => ({ mcpHandler: vi.fn((await real<typeof import('../src/mcp/mcp-handler')>()).mcpHandler) }))

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

/** A JSON-RPC tools/call as a 2026-07-28 client sends it, with its capabilities in the request's own envelope. */
const modernCall = (app: Served, token: string, params: { name: string; arguments: object; inputResponses?: object }, capabilities: object) =>
  app.request('/api/mcp', {
    body: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientCapabilities': capabilities,
          'io.modelcontextprotocol/clientInfo': { name: 'client', version: '1.0.0' },
        },
      },
    },
    headers: { host, accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/call', 'mcp-name': params.name, authorization: `Bearer ${token}` },
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
    for (const admin of [undefined, { mcp: {} }, { mcp: { sql: false } }]) {
      const rootOff = await served(admin, 'root@example.com')
      expect(await toolNames(rootOff.app, rootOff.mcp)).toEqual(records)
    }
    const writing = await served({ mcp: { writes: true } })
    const written = (await resultOf(await rpc(writing.app, writing.mcp, 'tools/list'))).tools as Array<{ name: string; annotations?: { readOnlyHint?: boolean } }>
    expect(written.map((tool) => [tool.name, tool.annotations?.readOnlyHint])).toEqual([...records.map((name) => [name, true]), ['create_record', false], ['update_record', false]])
  })

  it('refuses a write outside the resources mcp.writes lists, before asking', async () => {
    const { app, mcp } = await served({ mcp: { writes: { resources: ['organizations'] } } })
    const message = 'Writes over MCP reach only organizations, not labels; nothing was written.'
    expect(await call(app, mcp, 'create_record', { resource: 'labels', data: { name: 'Urgent' } })).toEqual({ error: 'forbidden', message })
    expect(await call(app, mcp, 'update_record', { resource: 'labels', key: 1, data: { name: 'Urgent' } })).toEqual({ error: 'forbidden', message })
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

  // Last, as it adds an organization the reads before would find.
  it('creates a record after the person approves it, through the API\'s rules and hooks', async () => {
    const events: Array<{ operation: string; resource: string }> = []
    const { app, mcp } = await served({ mcp: { writes: true }, writeHooks: [async (event) => void events.push({ operation: event.operation, resource: event.resource.name })] })
    const args = { resource: 'organizations', data: { name: 'Approved Org' } }
    const legacy = await resultOf(await rpc(app, mcp, 'tools/call', { name: 'create_record', arguments: args }))
    expect(legacy).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('cannot ask you to approve') }] })
    const asked = await resultOf(await modernCall(app, mcp, { name: 'create_record', arguments: args }, { elicitation: {} }))
    expect(asked).toMatchObject({ resultType: 'input_required', inputRequests: { approve: { method: 'elicitation/create', params: { message: expect.stringContaining('Approved Org') } } } })
    expect(events).toEqual([])
    const approved = await resultOf(await modernCall(app, mcp, { name: 'create_record', arguments: args, inputResponses: { approve: { action: 'accept', content: { approve: true } } } }, { elicitation: {} }))
    const created = JSON.parse((approved.content as Array<{ text: string }>)[0]!.text) as { record: { id: number; name: string }; etag: string }
    expect(created).toMatchObject({ record: { name: 'Approved Org' }, etag: expect.any(String) })
    expect(events).toEqual([{ operation: 'create', resource: 'organizations' }])
    expect(await call(app, mcp, 'get_record', { resource: 'organizations', key: created.record.id })).toEqual(created)
  })
})

// A host's own role mapping around betterAuthAuthenticator, without its forAudience.
const wrapped = (own: BetterAuthAuthenticator) => Object.assign((request: Request) => own(request), { userIdType: own.userIdType })

const accessControl = (response: Response) => [...response.headers].filter(([name]) => name.startsWith('access-control-'))

describe('an endpoint the host serves itself (options.mcp false)', () => {
  const unsigned = (claims: object) => `${base64url.encode(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${base64url.encode(JSON.stringify(claims))}.`

  it('starts without forAudience and answers 404 at the path and under it, whatever the request carries', async () => {
    const app = await serveMcp(stores, { admin: { mcp: false, cors: ['https://assistant.example'] }, authenticate: wrapped })
    const { cookie, tokens } = await app.grant()
    const own = ((await (await app.request('/api/auth/token', { cookie })).json()) as { token: string }).token
    const credentials = [
      undefined,
      `Bearer ${tokens.access_token}`,
      `Bearer ${own}`,
      'Bearer garbage',
      `Bearer ${unsigned({ iss: origin, aud: resource, sub: '1', exp: 4_102_444_800 })}`,
      `Basic ${btoa(`ana@example.com:${password}`)}`,
    ]
    const closed = await (await rpc(app, undefined, 'tools/list')).text()
    for (const authorization of credentials) {
      const headers = { host, ...(authorization && { authorization }) }
      const answers = [
        await rpc(app, undefined, 'tools/list', {}, headers),
        await app.request('/api/mcp', { headers }),
        await app.request('/api/mcp', { method: 'DELETE', headers }),
        await app.request('/api/mcp/', { body: {}, headers }),
        await app.request('/api/mcp/tools', { headers }),
      ]
      for (const answer of answers) {
        expect(answer.status, authorization).toBe(404)
        expect(await answer.text()).toBe(closed)
      }
    }
    for (const path of ['/api/mcp', '/api/mcp/x']) {
      const preflight = await app.request(path, { method: 'OPTIONS', from: 'https://assistant.example', headers: { 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization' } })
      const head = await app.request(path, { method: 'HEAD', from: 'https://assistant.example' })
      for (const answer of [preflight, head]) {
        expect(answer.status).toBe(404)
        expect(accessControl(answer).filter(([name]) => name.startsWith('access-control-allow-'))).toEqual([])
      }
    }
    // The MCP token opens nothing of the app's own API, and gets no app token either.
    expect((await app.request('/api/v1/organizations', { headers: { authorization: `Bearer ${tokens.access_token}` } })).status).toBe(401)
    expect((await app.request('/api/v1/organizations', { headers: { authorization: `Bearer ${own}` } })).status).toBe(200)
    const exchanged = await app.request('/api/auth/token', { headers: { authorization: `Bearer ${tokens.access_token}` } })
    expect(exchanged.ok).toBe(false)
    expect(await exchanged.text()).not.toContain('"token"')
  })

  it('builds no generic endpoint and asks for no audience, even from an authenticate that has forAudience', async () => {
    for (const built of [mcpTools, mcpServer, mcpHandler]) vi.mocked(built).mockClear()
    const forAudience = vi.fn()
    const app = await serveMcp(stores, { admin: { mcp: false }, authenticate: (own) => Object.assign(own, { forAudience: forAudience.mockImplementation(own.forAudience) }) })
    const { tokens } = await app.grant()
    for (const [method, params] of [['tools/list', {}], ['tools/call', { name: 'list_records', arguments: { resource: 'organizations' } }]] as const) {
      const answer = await rpc(app, tokens.access_token, method, params)
      expect(answer.status).toBe(404)
      expect(await answer.text()).not.toContain('jsonrpc')
    }
    expect(forAudience).not.toHaveBeenCalled()
    for (const built of [mcpTools, mcpServer, mcpHandler]) expect(vi.mocked(built)).not.toHaveBeenCalled()
    // The same authenticate builds them without the option.
    createAdmin({ resources: [], db: stores.fixture.db, authenticate: app.authenticate, auth: app.auth })
    expect(forAudience).toHaveBeenCalledWith(resource)
    expect(vi.mocked(mcpTools)).toHaveBeenCalled()
  })

  it('keeps the OAuth provider\'s discovery, registration and token endpoint as they are', async () => {
    const served = await serveMcp(stores)
    const own = await serveMcp(stores, { admin: { mcp: false }, authenticate: wrapped })
    const from = 'https://assistant.example'
    for (const path of ['/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/api/mcp']) {
      const [expected, actual] = [await served.request(path, { from }), await own.request(path, { from })]
      expect(actual.status, path).toBe(expected.status)
      expect(accessControl(actual)).toEqual(accessControl(expected))
      expect(await actual.json()).toEqual(await expected.json())
    }
    expect(((await (await own.request('/.well-known/oauth-protected-resource/api/mcp', { from })).json()) as { resource: string }).resource).toBe(resource)
    for (const path of ['/api/auth/oauth2/register', '/api/auth/oauth2/token']) {
      const preflight = (app: typeof own) => app.request(path, { method: 'OPTIONS', from, headers: { 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type, dpop' } })
      const [expected, actual] = [await preflight(served), await preflight(own)]
      expect(actual.status, path).toBe(expected.status)
      expect(accessControl(actual)).toEqual(accessControl(expected))
    }
    for (const app of [served, own]) {
      const registered = await app.request('/api/auth/oauth2/register', { from, body: { redirect_uris: [redirectUri], client_name: 'From afar', token_endpoint_auth_method: 'none' } })
      expect(registered.status).toBe(201)
      expect(registered.headers.get('access-control-allow-origin')).toBe('*')
    }
  })

  it('starts with MCP off too, serving none of the provider', async () => {
    const auth = await authOn(await stores.migrated.clone(), { mcp: undefined })
    const plain = (request: Request) => ({ user: { id: request.headers.get('authorization') ?? '', roles: [] } })
    const app = createAdmin({ resources: [], db: stores.fixture.db, authenticate: plain, auth, options: { mcp: false } })
    expect((await app.request(`${origin}/.well-known/oauth-authorization-server`)).status).toBe(404)
    expect((await app.request(`${origin}/api/auth/oauth2/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(404)
  })
})
