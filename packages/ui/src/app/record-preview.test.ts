import { describe, expect, it } from 'vitest'
import type { ResourceModel } from '@protobase/schema'
import { displayRow } from './displays/list-displays'
import { recordPreview } from './record-preview'

const tasks = {
  name: 'tasks',
  primaryKey: ['id'],
  fields: { id: { name: 'id', type: 'integer' }, title: { name: 'title', type: 'text' }, owner_id: { name: 'owner_id', type: 'relation', relation: { resource: 'people' } }, notes: { name: 'notes', type: 'text' } },
} as unknown as ResourceModel

describe('recordPreview', () => {
  it("keeps the fields a list row loaded, its relations as keys, with the row's ETag and permissions", () => {
    const row = { id: 7, title: 'Ship', owner_id: { id: 3, name: 'Ada' }, subtasks: [{ id: 1 }], etag: '"v2"', permissions: { update: true, delete: false } }
    expect(recordPreview(tasks, displayRow(tasks, row).record)).toEqual({
      record: { id: 7, title: 'Ship', owner_id: 3 },
      etag: '"v2"',
      permissions: { update: true, delete: false },
    })
  })

  it('has no permissions when the list gave none', () => {
    expect(recordPreview(tasks, { id: 7, etag: '"v1"' })).toEqual({ record: { id: 7 }, etag: '"v1"' })
  })
})
