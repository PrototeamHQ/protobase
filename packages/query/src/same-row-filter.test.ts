import { describe, expect, it } from 'vitest'
import { Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type CompiledQuery, type DatabaseConnection, type Driver } from 'kysely'
import { checkFilter, f, printFilter, resource, where, type ResourceModel } from '@protobase/schema'
import { compiled } from '../../../test-support/compile-sql'
import { lookupRead } from './linked-read'
import { withLookupRead } from './lookup-read'
import { sameRowFilter, sameRowPlan } from './same-row-filter'
import type { Scope } from './scope'

const channels = resource('channels').table('channels')
  .fields({ id: f.integer(), tenant_id: f.integer(), name: f.text().filterable(), deleted_at: f.timestamp().optional() })
  .primaryKey((r) => r.id).tenant((r) => r.tenant_id).softDelete((r) => r.deleted_at).toModel()
const messages = resource('messages').table('messages')
  .fields({ id: f.integer(), tenant_id: f.integer(), body: f.text().filterable(), author: f.text().filterable(), channel_id: f.relation('channels'), thread_id: f.relation('channels').optional(), channel_name: f.text().lookup({ via: 'channel_id', field: 'name' }).filterable(), deleted_at: f.timestamp().optional() })
  .primaryKey((r) => r.id).tenant((r) => r.tenant_id).softDelete((r) => r.deleted_at).search((r) => [r.body]).toModel()

const checked = (model: ResourceModel, filter: Parameters<typeof checkFilter>[1]) => {
  const result = checkFilter(model, filter)
  if (!result.ok) throw new Error(result.errors[0]!.message)
  return result.filter
}

const channelsParent = { model: channels, key: channels.fields.id!, scope: { tenantValue: 7 } }
const text = (planned: ReturnType<typeof sameRowPlan>, resolved: string[][] = []) => {
  const built = planned!.build(resolved)
  return built && printFilter(built)
}

describe('sameRowPlan', () => {
  it('keeps the soft delete, the tenant, the row filter and the filter as they are, reading nothing', () => {
    const planned = sameRowPlan(messages, { tenantValue: 7, rowFilter: checked(messages, where.eq('author', 'ann')) }, checked(messages, where.eq('body', 'hi')))
    expect(planned!.subqueries).toEqual([])
    expect(text(planned)).toBe('isNull(deleted_at) AND in(tenant_id, 7) AND author = "ann" AND body = "hi"')
  })

  it('keeps every tenant of a read across tenants', () => {
    expect(text(sameRowPlan(messages, { tenantValues: [7, 8] }, undefined))).toBe('isNull(deleted_at) AND in(tenant_id, 7, 8)')
  })

  it('is undefined for a read that keeps no row out', () => {
    const plain = resource('notes').table('notes').fields({ id: f.integer() }).primaryKey((r) => r.id).toModel()
    expect(text(sameRowPlan(plain, undefined, undefined))).toBeUndefined()
  })

  it("resolves a parent the caller must read to the keys they read, by its subquery", () => {
    const planned = sameRowPlan(messages, { tenantValue: 7, parents: [{ field: messages.fields.channel_id!, parent: channelsParent }] }, undefined)
    expect(compiled(planned!.subqueries[0]!)).toEqual({ sql: 'select "t"."id" from "channels" as "t" where "t"."deleted_at" is null and "t"."tenant_id" = $1', parameters: [7] })
    expect(text(planned, [['1', '2']])).toBe('isNull(deleted_at) AND in(tenant_id, 7) AND in(channel_id, 1, 2)')
  })

  it('keeps the rows naming no parent of a nullable relation, and none when no parent is read', () => {
    const planned = sameRowPlan(messages, { tenantValue: 7, parents: [{ field: messages.fields.thread_id!, parent: channelsParent }] }, undefined)
    expect(text(planned, [[]])).toBe('isNull(deleted_at) AND in(tenant_id, 7) AND (isNull(thread_id) OR isNull(id))')
    expect(text(sameRowPlan(messages, { tenantValue: 7, parents: [{ field: messages.fields.channel_id! }] }, undefined))).toBe('isNull(deleted_at) AND in(tenant_id, 7) AND isNull(id)')
  })

  it('resolves a lookup term to the links of the records that hold it, and its emptiness to the others', () => {
    const read = lookupRead({ model: channels, scope: { tenantValue: 7 }, value: channels.fields.name!, match: channels.fields.id!, link: messages.fields.channel_id! })
    const model: ResourceModel = { ...messages, fields: { ...messages.fields, channel_name: withLookupRead(messages.lookups!.channel_name!, read) } }
    const planned = sameRowPlan(model, { tenantValue: 7 }, checked(model, where.or(where.eq('channel_name', 'general'), where.isNull('channel_name'))))
    expect(planned!.subqueries.map((query) => compiled(query).sql)).toEqual([
      'select "t"."id" from "channels" as "t" where "t"."deleted_at" is null and "t"."tenant_id" = $1 and "t"."name" = $2',
      'select "t"."id" from "channels" as "t" where "t"."deleted_at" is null and "t"."tenant_id" = $1 and "t"."name" is not null',
    ])
    expect(text(planned, [['3'], ['3', '4']])).toBe('isNull(deleted_at) AND in(tenant_id, 7) AND (in(channel_id, 3) OR NOT in(channel_id, 3, 4))')
  })

  it('keeps a row whose nullable link names no record when it negates a lookup', () => {
    const read = lookupRead({ model: channels, scope: { tenantValue: 7 }, value: channels.fields.name!, match: channels.fields.id!, link: messages.fields.thread_id! })
    const model: ResourceModel = { ...messages, fields: { ...messages.fields, channel_name: withLookupRead(messages.lookups!.channel_name!, read) } }
    const planned = sameRowPlan(model, { tenantValue: 7 }, checked(model, where.isNull('channel_name')))
    expect(text(planned, [['3']])).toBe('isNull(deleted_at) AND in(tenant_id, 7) AND (isNull(thread_id) OR NOT in(thread_id, 3))')
    expect(text(planned, [[]])).toBe('isNull(deleted_at) AND in(tenant_id, 7) AND NOT isNull(id)')
  })

  it('keeps a related() term on a nullable field to no row when the caller reads none of its records', () => {
    const term = { field: messages.fields.thread_id!, related: { model: channels } }
    expect(text(sameRowPlan(messages, { tenantValue: 7, parents: [term] }, undefined))).toBe('isNull(deleted_at) AND in(tenant_id, 7) AND isNull(id)')
  })

  it('matches a text tenant exactly, a * in it too', () => {
    const notes = resource('notes').table('notes').fields({ id: f.integer(), org: f.text() }).primaryKey((r) => r.id).tenant((r) => r.org).toModel()
    expect(text(sameRowPlan(notes, { tenantValue: 'acme*' }, undefined))).toBe('in(org, "acme*")')
  })

  it('cannot keep a search over a lookup field to the row', () => {
    const searched = { ...messages, fields: { ...messages.fields, channel_name: messages.lookups!.channel_name! }, search: ['channel_name'] }
    expect(sameRowPlan(searched, { tenantValue: 7 }, checked(messages, where.search('x')))).toBeUndefined()
  })
})

// A database answering every query with this one row.
const answering = (row: Record<string, unknown>, queries: CompiledQuery[]) => {
  const connection: DatabaseConnection = {
    executeQuery: async (query) => (queries.push(query), { rows: [row] as never[] }),
    streamQuery: () => { throw new Error('Not implemented: the test database streams nothing') },
  }
  const driver: Driver = { init: async () => {}, acquireConnection: async () => connection, beginTransaction: async () => {}, commitTransaction: async () => {}, rollbackTransaction: async () => {}, releaseConnection: async () => {}, destroy: async () => {} }
  return new Kysely<any>({ dialect: { createAdapter: () => new PostgresAdapter(), createDriver: () => driver, createIntrospector: (db) => new PostgresIntrospector(db), createQueryCompiler: () => new PostgresQueryCompiler() } })
}

describe('sameRowFilter', () => {
  const scope: Scope = { tenantValue: 7, parents: [{ field: messages.fields.channel_id!, parent: channelsParent }] }

  it('reads every subquery in one statement, as text arrays without nulls', async () => {
    const queries: CompiledQuery[] = []
    const filter = await sameRowFilter(answering({ s0: ['5'] }, queries), messages, scope, undefined)
    expect(queries.map((query) => query.sql)).toEqual(['select array(select v::text from (select "t"."id" from "channels" as "t" where "t"."deleted_at" is null and "t"."tenant_id" = $1) as s(v) where v is not null) as "s0"'])
    expect(filter && printFilter(filter)).toBe('isNull(deleted_at) AND in(tenant_id, 7) AND in(channel_id, 5)')
  })

  it('reads nothing without a subquery, and answers false when the read cannot be kept to the row', async () => {
    const queries: CompiledQuery[] = []
    const db = answering({}, queries)
    expect(await sameRowFilter(db, messages, { tenantValue: 7 }, undefined)).toBeTruthy()
    const searched = { ...messages, fields: { ...messages.fields, channel_name: messages.lookups!.channel_name! }, search: ['channel_name'] }
    expect(await sameRowFilter(db, searched, { tenantValue: 7 }, checked(messages, where.search('x')))).toBe(false)
    expect(queries).toEqual([])
  })
})
