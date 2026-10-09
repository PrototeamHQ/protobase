import { describe, expect, it } from 'vitest'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { defaultOrderBy, parseSort, sortToOrderBy } from './list-order'

describe('list order', () => {
  it('parses and prints AIP-132 order_by', () => {
    expect(parseSort('createdAt desc')).toEqual({ columnId: 'createdAt', direction: 'desc' })
    expect(parseSort('number')).toEqual({ columnId: 'number', direction: 'asc' })
    expect(sortToOrderBy({ columnId: 'total', direction: 'desc' })).toBe('total desc')
  })

  it('defaults to the view sort, then the primary key', () => {
    const model = { primaryKey: ['id'] } as ResourceModel
    expect(defaultOrderBy(model, { list: { columns: [], sort: [['createdAt', 'desc']] } } as unknown as ViewModel)).toBe('createdAt desc')
    expect(defaultOrderBy(model, undefined)).toBe('id asc')
  })
})
