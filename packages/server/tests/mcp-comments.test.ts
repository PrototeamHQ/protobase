import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { f, resource, type AccessContext } from '@protobase/schema'
import type { AdminOptions } from '../src/admin-options'
import { commentsMigration } from '../src/comments/comments-sql'
import { allResources } from '../../../test-support/server'
import { mcpStores, serveMcp, type McpStores } from './support/mcp-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

// Admins read every ticket, sales only the ones not closed.
const tickets = resource('tickets')
  .table('tickets')
  .fields({ id: f.integer().readOnly(), title: f.text(), status: f.enum(['open', 'closed']) })
  .primaryKey((r) => r.id)
  .access({ read: ({ user }: AccessContext) => (user?.roles?.includes('admin') ? true : 'status != "closed"'), create: () => false, update: () => false, delete: () => false })
  .comments()

let stores: McpStores
beforeAll(async () => {
  stores = await mcpStores()
  const { pg, db } = stores.fixture
  await pg.exec(`create table tickets (id integer generated always as identity primary key, title text not null, status text not null);
    insert into tickets (title, status) values ('Printer on fire', 'open'), ('Old laptop', 'closed');`)
  await pg.exec((await commentsMigration(db))!)
})
afterAll(async () => { await stores.fixture.db.destroy() })

const host = 'localhost:5173'

type Served = Awaited<ReturnType<typeof serveMcp>>

// The JSON-RPC answer, sent as JSON or as one server-sent event.
const resultOf = async (response: Response) => {
  const text = await response.text()
  const data = text.trimStart().startsWith('{') ? text : text.split('\n').find((line) => line.startsWith('data: '))!.slice('data: '.length)
  const message = JSON.parse(data) as { result?: Record<string, unknown>; error?: unknown }
  expect(message.error).toBeUndefined()
  return message.result!
}

const rpc = (app: Served, token: string, method: string, params: object = {}) =>
  app.request('/api/mcp', {
    body: { jsonrpc: '2.0', id: 1, method, params },
    headers: { host, accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25', authorization: `Bearer ${token}` },
  })

const toolNames = async (app: Served, token: string) => ((await resultOf(await rpc(app, token, 'tools/list'))).tools as Array<{ name: string }>).map((tool) => tool.name)

const answered = async (app: Served, token: string, name: string, args: object) =>
  (await resultOf(await rpc(app, token, 'tools/call', { name, arguments: args }))) as { content: Array<{ text: string }>; isError?: boolean }

const call = async (app: Served, token: string, name: string, args: object) => JSON.parse((await answered(app, token, name, args)).content[0]!.text) as unknown

// Ana's token carries her first role, sales.
const served = async (admin: AdminOptions) => {
  const app = await serveMcp(stores, { admin, resources: [...allResources, tickets] })
  const { cookie, tokens } = await app.grant('ana@example.com')
  const own = ((await (await app.request('/api/auth/token', { cookie })).json()) as { token: string }).token
  const rest = (path: string) => app.request(`/api/v1/${path}`, { headers: { authorization: `Bearer ${own}` } })
  return { app, mcp: tokens.access_token, rest }
}

const records = ['list_resources', 'describe_resource', 'list_records', 'count_records', 'get_record']
const writes = ['create_record', 'update_record', 'delete_record', 'batch_write']

describe('record comments over MCP', () => {
  it('offers list_comments, and add_comment with writes on, when a resource takes comments', async () => {
    const reading = await served({})
    expect(await toolNames(reading.app, reading.mcp)).toEqual([...records, 'list_comments'])
    const writing = await served({ mcp: { writes: true } })
    expect(await toolNames(writing.app, writing.mcp)).toEqual([...records, ...writes, 'list_comments', 'add_comment'])
  })

  it('refuses what the REST comments refuse, with their message, before asking to add', async () => {
    const { app, mcp, rest } = await served({ mcp: { writes: { rolesWithoutApproval: ['sales'] } } })
    for (const [resource, key] of [['tickets', 2], ['organizations', 1]] as const) {
      const refused = await rest(`${resource}/${key}:comments`)
      expect(refused.status).toBe(404)
      const expected = { error: 'not-found', message: ((await refused.json()) as { detail: string }).detail }
      expect(await call(app, mcp, 'list_comments', { resource, key })).toEqual(expected)
      expect(await call(app, mcp, 'add_comment', { resource, key, text: 'Hi' })).toEqual(expected)
    }
  })

  it('adds a comment for a role without approval and reads it back as the REST API gives it', async () => {
    const { app, mcp, rest } = await served({ mcp: { writes: { rolesWithoutApproval: ['sales'] } } })
    const added = (await call(app, mcp, 'add_comment', { resource: 'tickets', key: 1, text: '  Keep the fix small.  ' })) as { author: { id: string }; created_at: string; text: string }
    expect(added).toMatchObject({ text: 'Keep the fix small.' })
    await call(app, mcp, 'add_comment', { resource: 'tickets', key: '1', text: 'No new dependencies.' })
    const page = await call(app, mcp, 'list_comments', { resource: 'tickets', key: 1, page_size: 1 })
    const all = (await (await rest('tickets/1:comments')).json()) as { items: Array<{ author: unknown; created_at: string; body: string }> }
    const [newest] = all.items
    expect(page).toEqual({ items: [{ author: newest!.author, created_at: newest!.created_at, text: 'No new dependencies.' }], next_page_token: expect.any(String) })
    const next = await call(app, mcp, 'list_comments', { resource: 'tickets', key: 1, page_token: (page as { next_page_token: string }).next_page_token })
    expect(next).toEqual({ items: [added], next_page_token: '' })
    expect(all.items.map((item) => item.body)).toEqual(['No new dependencies.', 'Keep the fix small.'])
  })

  it('asks before adding for everyone else, and adds nothing when the client cannot ask', async () => {
    const { app, mcp, rest } = await served({ mcp: { writes: true } })
    const before = ((await (await rest('tickets/1:comments')).json()) as { items: unknown[] }).items.length
    const refused = await answered(app, mcp, 'add_comment', { resource: 'tickets', key: 1, text: 'Unasked' })
    expect(refused).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('cannot ask you to approve') }] })
    expect(((await (await rest('tickets/1:comments')).json()) as { items: unknown[] }).items).toHaveLength(before)
  })
})
