import { describe, expect, it } from 'vitest'
import { numberedBefore } from './numbered-before'

describe('numberedBefore', () => {
  it('is the value each record had before the first operation that numbered it, ignoring other operations', () => {
    const results = [
      { op: 'update' as const, resource: 'tasks', record: { id: 9, rank: 7 }, etag: 'u' },
      { op: 'reorder' as const, resource: 'tasks', records: [{ record: { id: 1, rank: 5 }, etag: 'a', previous: 3 }] },
      { op: 'move' as const, resource: 'tasks', records: [{ record: { id: 1, rank: 2 }, etag: 'b', previous: 5 }, { record: { id: 2, rank: 3 }, etag: 'c', previous: 2 }] },
    ]
    expect(numberedBefore(results, (record) => String(record.id))).toEqual(new Map([['1', 3], ['2', 2]]))
  })
})
