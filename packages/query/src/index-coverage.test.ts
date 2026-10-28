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
