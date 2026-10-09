import { describe, expect, it } from 'vitest'
import { reorder } from './reorder'

describe('reorder', () => {
  it('moves an item forward and backward', () => {
    expect(reorder(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(reorder(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })
  it('returns a copy when nothing moves', () => {
    const items = ['a', 'b']
    expect(reorder(items, 1, 1)).toEqual(items)
    expect(reorder(items, 1, 1)).not.toBe(items)
    expect(reorder(items, 5, 0)).toEqual(items)
  })
  it('clamps the target index', () => {
    expect(reorder(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a'])
  })
})
