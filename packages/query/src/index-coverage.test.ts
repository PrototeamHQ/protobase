import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { uncoveredColumns } from './index-coverage'
import type { TableIndexes } from './table-indexes'

const messages = resource('messages').table('messages')
  .fields({ id: f.integer(), channel_id: f.relation('channels'), tenant_id: f.integer() })
  .primaryKey((r) => r.id).tenant((r) => r.tenant_id).toModel()
const scope = { tenantValue: 1, parents: [{ field: messages.fields.channel_id! }] }
const btree = (...columns: string[]) => ({ name: columns.join('_'), method: 'btree', partial: false, keys: columns.map((column) => ({ column, definition: column, opclass: 'int4_ops' })) })
const table = (...indexes: ReturnType<typeof btree>[]): TableIndexes => ({ kind: 'table', indexes })

describe('uncoveredColumns of a read that keeps to its parents', () => {
  it('needs a btree index serving the relation to the parent', () => {
    expect(uncoveredColumns(messages, table(btree('id')), {}, scope)).toEqual([{ field: 'channel_id', column: 'channel_id', use: 'parent', need: 'btree', suggestion: 'create index on "messages" ("channel_id")' }])
  })

  it('takes one leading with it, or with the pinned tenant before it', () => {
    expect(uncoveredColumns(messages, table(btree('channel_id', 'id')), {}, scope)).toEqual([])
    expect(uncoveredColumns(messages, table(btree('tenant_id', 'channel_id')), {}, scope)).toEqual([])
  })
})

describe('uncoveredColumns of a related() term', () => {
  const term = { field: messages.fields.channel_id!, related: { model: messages } }

  it('reads the relation as related, and pins it as in() does', () => {
    expect(uncoveredColumns(messages, table(btree('id')), {}, { tenantValue: 1, parents: [term] })[0]).toMatchObject({ field: 'channel_id', use: 'related' })
    expect(uncoveredColumns(messages, table(btree('channel_id', 'id')), { sort: [['id', 'asc']] }, { tenantValue: 1, parents: [term] })).toEqual([])
  })

  it('needs the key it selects served, under what the subfilter pins', () => {
    const selects = messages.fields.channel_id!
    expect(uncoveredColumns(messages, table(btree('id')), { selects })[0]).toMatchObject({ field: 'channel_id', use: 'related' })
    expect(uncoveredColumns(messages, table(btree('channel_id')), { selects })).toEqual([])
  })
})

describe('uncoveredColumns of a read that keeps the first rows per value', () => {
  const posts = resource('posts').table('posts')
    .fields({ id: f.integer(), channel_id: f.relation('channels'), created_at: f.timestamp(), tenant_id: f.integer() })
    .primaryKey((r) => r.id).tenant((r) => r.tenant_id).toModel()
  const sorted = { per: 'channel_id', sort: [['created_at', 'desc']] as Array<[string, 'asc' | 'desc']> }

  it('needs one index on the field with the sort under it, and names it', () => {
    expect(uncoveredColumns(posts, table(btree('channel_id'), btree('created_at')), sorted, { tenantValue: 1 })).toEqual([
      { field: 'channel_id', column: 'channel_id', use: 'per', need: 'btree', suggestion: 'create index on "posts" ("channel_id", "created_at")' },
    ])
    expect(uncoveredColumns(posts, table(btree('created_at', 'channel_id')), sorted, { tenantValue: 1 })[0]).toMatchObject({ use: 'per' })
  })

  it('takes it under the pinned tenant, and the field alone without a sort', () => {
    expect(uncoveredColumns(posts, table(btree('channel_id', 'created_at')), sorted, { tenantValue: 1 })).toEqual([])
    expect(uncoveredColumns(posts, table(btree('tenant_id', 'channel_id', 'created_at')), sorted, { tenantValue: 1 })).toEqual([])
    expect(uncoveredColumns(posts, table(btree('id')), { per: 'channel_id' }, { tenantValue: 1 })[0]).toMatchObject({ field: 'channel_id', use: 'per', suggestion: 'create index on "posts" ("channel_id")' })
    expect(uncoveredColumns(posts, table(btree('channel_id')), { per: 'channel_id' }, { tenantValue: 1 })).toEqual([])
  })
})
