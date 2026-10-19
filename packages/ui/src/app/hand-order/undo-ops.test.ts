import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { undoOps } from './undo-ops'

const model = resource('tasks')
  .table('tasks')
  .fields({ id: f.integer(), status: f.enum(['todo', 'done']).filterable(), rank: f.integer().sortable() })
  .primaryKey((r) => r.id)
  .position((r) => r.rank)
  .toModel()

describe('undoOps', () => {
  it('puts back the fields a drag changed, with the ETags it gave the records', () => {
    const writes = [
      { before: { id: 1, status: 'todo', rank: 1 }, record: { id: 1, status: 'done', rank: 2 }, etag: 'e1' },
      { before: { id: 2, status: 'todo', rank: 2 }, record: { id: 2, status: 'todo', rank: 1 }, etag: 'e2' },
    ]
    expect(undoOps(model, writes, ['status', 'rank'])).toEqual([
      { op: 'update', resource: 'tasks', key: 1, data: { status: 'todo', rank: 1 }, etag: 'e1' },
      { op: 'update', resource: 'tasks', key: 2, data: { rank: 2 }, etag: 'e2' },
    ])
  })

  it('leaves out records it did not change, and fields not known before it', () => {
    const writes = [
      { before: { id: 1, rank: 1 }, record: { id: 1, rank: 1 }, etag: 'e1' },
      { before: { id: 2 }, record: { id: 2, rank: 3 }, etag: 'e2' },
      { before: { id: 3, rank: null }, record: { id: 3, rank: 4 }, etag: 'e3' },
    ]
    expect(undoOps(model, writes, ['rank'])).toEqual([{ op: 'update', resource: 'tasks', key: 3, data: { rank: null }, etag: 'e3' }])
  })
})
