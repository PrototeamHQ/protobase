import { jwtDecrypt } from 'jose'
import { Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type CompiledQuery, type DatabaseConnection, type Driver } from 'kysely'
import { describe, expect, it } from 'vitest'
import { checkFilter, f, parseFilter, resource, type ResourceModel } from '@protobase/schema'
import { liveTokenKey } from './live-key'
import { liveTokens } from './live-tokens'

const channels = resource('channels').table('channels').fields({ id: f.integer(), name: f.text() }).primaryKey((r) => r.id).toModel()
const messages = resource('messages').table('messages').fields({ id: f.integer().filterable(), channel_id: f.relation('channels').filterable(), body: f.text().filterable() }).primaryKey((r) => r.id).toModel()

const checked = (model: ResourceModel, source: string) => {
  const parsed = parseFilter(source)
  const result = parsed.ok && parsed.ast ? checkFilter(model, parsed.ast) : undefined
  if (!result?.ok || !result.filter) throw new Error(`check failed: ${source}`)
  return result.filter
}

// A read transaction answering every query with this one row.
const answering = (row: Record<string, unknown>, queries: CompiledQuery[]) => {
  const connection: DatabaseConnection = {
    executeQuery: async (query) => (queries.push(query), { rows: [row] as never[] }),
    streamQuery: () => { throw new Error('Not implemented: the test database streams nothing') },
  }
  const driver: Driver = { init: async () => {}, acquireConnection: async () => connection, beginTransaction: async () => {}, commitTransaction: async () => {}, rollbackTransaction: async () => {}, releaseConnection: async () => {}, destroy: async () => {} }
  return new Kysely<any>({ dialect: { createAdapter: () => new PostgresAdapter(), createDriver: () => driver, createIntrospector: (db) => new PostgresIntrospector(db), createQueryCompiler: () => new PostgresQueryCompiler() } })
}

describe('liveTokens', () => {
  const ticketKey = 'a-ticket-key-of-at-least-32-characters'
  const tokens = liveTokens({ app: 'chat', ticketKey, sessionEnd: async () => new Date(Date.now() + 60_000), keyTypesOf: () => ['integer'] })

  it("seals the read's resolved filter, its fields and the snapshot it was read in", async () => {
    const queries: CompiledQuery[] = []
    const subject = (await tokens.subject({ user: { id: 'u1', roles: [] }, signIn: { session: 's1', staff: false } }))!
    const scope = { parents: [{ field: messages.fields.channel_id!, parent: { model: channels, key: channels.fields.id!, scope: {} } }] }
    const token = await tokens.seal(answering({ s0: ['4', '9'], snapshot: '812:815:813' }, queries), subject, { model: messages, scope, fields: ['id', 'body'] })
    const { payload } = await jwtDecrypt(token!, await liveTokenKey(ticketKey))
    expect(payload).toMatchObject({ subs: [{ resource: 'messages', where: { in: ['channel_id', [4, 9]] } }], fields: ['id', 'body'], snapshot: '812:815:813', sub: 'u1', sid: 's1', iss: 'chat' })
    expect(queries.map((query) => query.sql)).toEqual([expect.stringMatching(/^select array\(/), 'select pg_current_snapshot()::text as snapshot'])
  })

  it("keeps the access rule in the conditions, narrowing the caller's filter", async () => {
    const subject = (await tokens.subject({ user: { id: 'u1', roles: [] }, signIn: { session: 's1', staff: false } }))!
    const scope = { rowFilter: checked(messages, 'channel_id = 3') }
    const token = await tokens.seal(answering({ snapshot: '1:1:' }, []), subject, { model: messages, scope, filter: checked(messages, 'id > 10'), fields: ['id'] })
    const { payload } = await jwtDecrypt(token!, await liveTokenKey(ticketKey))
    expect(payload.subs).toEqual([{ resource: 'messages', where: { and: [{ eq: ['channel_id', 3] }, { gt: ['id', 10] }] } }])
  })

  it('names a table outside the public schema with its schema', async () => {
    const subject = (await tokens.subject({ user: { id: '', roles: [] }, anonymous: true }))!
    const model = { ...channels, table: { schema: 'chat', name: 'channels' } }
    const token = await tokens.seal(answering({ snapshot: '1:1:' }, []), subject, { model, scope: {}, fields: ['id'] })
    const { payload } = await jwtDecrypt(token!, await liveTokenKey(ticketKey))
    expect(payload.subs).toEqual([{ resource: 'chat.channels' }])
  })

  it('gives no token for a filter the change stream cannot match as Postgres does', async () => {
    const subject = (await tokens.subject({ user: { id: '', roles: [] }, anonymous: true }))!
    const filter = checked(messages, 'body > "m"')
    expect(await tokens.seal(answering({}, []), subject, { model: messages, scope: {}, filter, fields: ['id'] })).toBeUndefined()
  })

  it('gives no token for a read it cannot keep to the row', async () => {
    const searched = { ...messages, fields: { ...messages.fields, channel_name: { ...messages.fields.body!, name: 'channel_name', lookup: { via: 'channel_id', field: 'name' } } }, search: ['channel_name'] }
    const subject = (await tokens.subject({ user: { id: '', roles: [] }, anonymous: true }))!
    const filter = { kind: 'search' as const, text: 'x', span: { start: 0, end: 0 } }
    expect(await tokens.seal(answering({}, []), subject, { model: searched as never, scope: {}, filter, fields: ['id'] })).toBeUndefined()
  })
})
