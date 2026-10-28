import { describe, expect, it } from 'vitest'
import { f, resource, type ResolvedAccess } from '@protobase/schema'
import { parentReads } from './parent-reads'
import { buildRegistry, type Entry } from './registry'

const channels = resource('channels').table('channels').fields({ id: f.integer(), tenant_id: f.integer() }).primaryKey((r) => r.id).tenant((r) => r.tenant_id)
const messages = resource('messages').table('messages')
  .fields({ id: f.integer(), channel_id: f.relation('channels'), author_id: f.relation('channels') })
  .primaryKey((r) => r.id).parent((r) => r.channel_id, 'read').parent((r) => r.author_id, 'update')
const folders = resource('folders').table('folders').fields({ id: f.integer(), parent_id: f.relation('folders').optional() }).primaryKey((r) => r.id).parent((r) => r.parent_id, 'read')
const replies = resource('replies').table('replies')
  .fields({ id: f.integer(), channel_id: f.relation('channels').optional(), thread_id: f.relation('replies').optional() })
  .primaryKey((r) => r.id).parent((r) => r.thread_id, 'read').parent((r) => r.channel_id, 'read')
const registry = buildRegistry([channels, messages, folders, replies])
const entry = (name: string) => registry.find(name)!

const reads = (resolved: Partial<ResolvedAccess>) => ({ operations: { read: true, list: true, create: false, update: false, delete: false }, recordChecks: [], readableFields: [], writableFields: { create: [], update: [] }, rowFilter: {}, ...resolved })
const resolving = (resolved: ResolvedAccess, calls: [string, readonly string[]][] = []) => async (parent: Entry, chain: readonly string[]) => {
  calls.push([parent.name, chain])
  return { resolved, full: parent.model, scope: { tenantValue: 1 } }
}

describe('parentReads', () => {
  it("names each read parent with the caller's scope on it, never an update parent", async () => {
    const found = await parentReads(entry('messages'), { user: { id: 'a', roles: [] }, tenant: 1 }, [], resolving(reads({})), registry.find)
    expect(found).toMatchObject([{ field: { name: 'channel_id' }, parent: { model: { name: 'channels' }, key: { name: 'id' }, scope: { tenantValue: 1 } } }])
  })

  it('reads no parent the caller cannot read, whose read rule needs the record, or of a tenant the caller lacks', async () => {
    const session = { user: { id: 'a', roles: [] }, tenant: 1 }
    const denied = reads({ operations: { read: false, list: false, create: false, update: false, delete: false } })
    expect(await parentReads(entry('messages'), session, [], resolving(denied), registry.find)).toEqual([{ field: entry('messages').model.fields.channel_id }])
    expect(await parentReads(entry('messages'), session, [], resolving(reads({ recordChecks: ['read'] })), registry.find)).toEqual([{ field: entry('messages').model.fields.channel_id }])
    expect(await parentReads(entry('messages'), { user: { id: 'a', roles: [] } }, [], resolving(reads({})), registry.find)).toEqual([{ field: entry('messages').model.fields.channel_id }])
  })

  it('follows a resource that is its own parent one level up, with the chain that led there', async () => {
    const calls: [string, readonly string[]][] = []
    await parentReads(entry('folders'), { user: { id: 'a', roles: [] } }, [], resolving(reads({}), calls), registry.find)
    expect(calls).toEqual([['folders', ['folders']]])
    expect(await parentReads(entry('folders'), { user: { id: 'a', roles: [] } }, ['folders'], resolving(reads({})), registry.find)).toEqual([])
  })

  it('follows the other parents of a resource reached as its own parent, never one met earlier', async () => {
    const calls: [string, readonly string[]][] = []
    await parentReads(entry('replies'), { user: { id: 'a', roles: [] }, tenant: 1 }, ['replies'], resolving(reads({}), calls), registry.find)
    expect(calls).toEqual([['channels', ['replies', 'replies']]])
    expect(await parentReads(entry('replies'), { user: { id: 'a', roles: [] } }, ['replies', 'channels'], resolving(reads({})), registry.find)).toEqual([])
  })
})
