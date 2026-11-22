import { domainToASCII } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { f, FieldIssue, resource } from '@protobase/schema'
import { mcpStores, serveMcp, type McpStores } from './support/mcp-app'

// `.prepare()` on a NOT NULL read-only column only the hook fills, and a name it normalises before a check constraint
// sees it, through the REST API, a batch write and the MCP tools alike.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const normalised = (name: string) => domainToASCII(name.trim().replace(/\.$/, ''))

const domains = resource('domains')
  .table('domains')
  .fields({ id: f.integer().readOnly().dbDefault(), name: f.text(), selector: f.text().readOnly() })
  .primaryKey((r) => r.id)
  .prepare(async (values, { operation, trx }) => {
    const name = values.name === undefined ? {} : { name: normalised(values.name) }
    if (name.name === '') throw new FieldIssue('name', 'Not a domain name')
    if (operation === 'update') return { ...values, ...name }
    // Read in the write's transaction, so a hook can number what it makes
    const { count } = await trx.selectFrom('domains').select((eb) => eb.fn.countAll<string>().as('count')).executeTakeFirstOrThrow()
    return { ...values, ...name, selector: `pb${Number(count) + 1}` }
  })

type Served = Awaited<ReturnType<typeof serveMcp>>

describe('.prepare() on every write path', () => {
  let stores: McpStores
  let served: Served
  let mcp: string
  let rest: string

  beforeAll(async () => {
    stores = await mcpStores()
    await stores.fixture.pg.exec(`create table domains (id integer generated always as identity primary key, name text not null check (name = lower(name)), selector text not null unique)`)
    // Ana's token carries her first role, sales.
    served = await serveMcp(stores, { resources: [domains], admin: { mcp: { writes: { rolesWithoutApproval: ['sales'] } } } })
    const { cookie, tokens } = await served.grant('ana@example.com')
    mcp = tokens.access_token
    rest = ((await (await served.request('/api/auth/token', { cookie })).json()) as { token: string }).token
  })

  afterAll(async () => {
    await stores?.fixture.db.destroy()
  })

  const api = (path: string, body: unknown, method = 'POST') => served.request(`/api/v1${path}`, { method, body, headers: { authorization: `Bearer ${rest}`, ...(method === 'PATCH' && { 'if-match': '*' }) } })

  const call = async (name: string, args: object) => {
    const response = await served.request('/api/mcp', {
      body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
      headers: { host: 'localhost:5173', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25', authorization: `Bearer ${mcp}` },
    })
    const text = await response.text()
    const data = text.trimStart().startsWith('{') ? text : text.split('\n').find((line) => line.startsWith('data: '))!.slice('data: '.length)
    return JSON.parse((JSON.parse(data) as { result: { content: Array<{ text: string }> } }).result.content[0]!.text) as Record<string, any>
  }

  const stored = async (id: number) => (await stores.fixture.pg.query('select name, selector from domains where id = $1', [id])).rows[0]
  const count = async () => Number((await stores.fixture.pg.query<{ count: string }>('select count(*) as count from domains')).rows[0]!.count)
  // The selector the hook gives the next record, whichever tests ran before
  const nextSelector = async () => `pb${(await count()) + 1}`

  it('creates through REST with the values the hook made, and updates with the name it normalises', async () => {
    const selector = await nextSelector()
    const created = await api('/domains', { name: 'Bücher.de.' })
    expect(created.status, await created.clone().text()).toBe(201)
    const record = (await created.json()) as { id: number; name: string; selector: string }
    expect(record).toMatchObject({ name: 'xn--bcher-kva.de', selector })
    const updated = await api(`/domains/${record.id}`, { name: 'EXAMPLE.org.' }, 'PATCH')
    expect(updated.status, await updated.clone().text()).toBe(200)
    expect(await stored(record.id)).toEqual({ name: 'example.org', selector })
  })

  it('refuses a value the client sends for a field only the hook fills', async () => {
    const refused = await api('/domains', { name: 'other.example', selector: 'mine' })
    expect(refused.status).toBe(400)
    expect(await refused.json()).toMatchObject({ errors: [{ field: 'selector', code: 'read-only' }] })
  })

  it('answers the hook\'s refusal with 422 naming the field, and writes nothing', async () => {
    const before = await count()
    const refused = await api('/domains', { name: '.' })
    expect(refused.status).toBe(422)
    expect(await refused.json()).toMatchObject({ errors: [{ field: 'name', code: 'invalid-value', message: 'Not a domain name' }] })
    expect(await count()).toBe(before)
  })

  it('creates through a batch write', async () => {
    const selector = await nextSelector()
    const response = await api(':batchWrite', { ops: [{ op: 'create', resource: 'domains', data: { name: 'Shop.Example.' } }] })
    expect(response.status, await response.clone().text()).toBe(200)
    const { results } = (await response.json()) as { results: Array<{ record: { id: number } }> }
    expect(await stored(results[0]!.record.id)).toEqual({ name: 'shop.example', selector })
  })

  it('creates and updates through the MCP tools', async () => {
    const selector = await nextSelector()
    const created = await call('create_record', { resource: 'domains', data: { name: 'Mail.Example.' } })
    expect(created).toMatchObject({ record: { name: 'mail.example', selector } })
    const updated = await call('update_record', { resource: 'domains', key: created.key, data: { name: 'POST.example' } })
    expect(updated).toMatchObject({ record: { name: 'post.example' } })
    expect(await stored(created.record.id)).toEqual({ name: 'post.example', selector })
  })
})
