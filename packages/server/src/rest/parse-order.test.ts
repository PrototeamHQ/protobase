import { describe, expect, it } from 'vitest'
import { parseOrder } from './parse-order'

describe('parseOrder', () => {
  it('reads terms with a direction and where nulls go, each optional', () => {
    expect(parseOrder('priority.desc.nullslast,id,due.nullsfirst,meta->>kind.asc')).toEqual([
      { field: { column: 'priority', json: [] }, direction: 'desc', nulls: 'last' },
      { field: { column: 'id', json: [] } },
      { field: { column: 'due', json: [] }, nulls: 'first' },
      { field: { column: 'meta', json: [{ arrow: '->>', key: 'kind' }] }, direction: 'asc' },
    ])
  })

  it('refuses an unknown or repeated modifier, or one out of order', () => {
    expect(() => parseOrder('id.down')).toThrow()
    expect(() => parseOrder('id.asc.desc')).toThrow()
    expect(() => parseOrder('id.nullslast.asc')).toThrow()
  })
})
