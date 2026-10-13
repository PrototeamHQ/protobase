import { describe, expect, it } from 'vitest'
import { gridGeometry, maxContentHeight, rowsInView, scrollFromTop, topFromScroll } from './geometry'
import { createPageCache, pagesForRange } from './page-cache'

describe('page cache', () => {
  it('returns rows by absolute index', () => {
    const cache = createPageCache<string>(3, 2)
    cache.setPage(1, ['d', 'e', 'f'])
    expect(cache.get(4)).toBe('e')
    expect(cache.get(0)).toBeUndefined()
  })
  it('evicts the oldest page', () => {
    const cache = createPageCache<number>(1, 2)
    cache.setPage(0, [0])
    cache.setPage(1, [1])
    cache.setPage(2, [2])
    expect(cache.hasPage(0)).toBe(false)
    expect(cache.size).toBe(2)
  })
  it('lists pages covering a range', () => {
    expect(pagesForRange(95, 205, 100)).toEqual([0, 1, 2])
  })
})

describe('geometry', () => {
  const total = 10_000_000
  const geometry = gridGeometry(total, 32, 800)
  it('caps content height for huge datasets', () => {
    expect(geometry.contentHeight).toBe(maxContentHeight)
    expect(geometry.scaled).toBe(true)
    expect(gridGeometry(1000, 32, 800).scaled).toBe(false)
  })
  it('maps scroll positions both ways', () => {
    const top = topFromScroll(geometry, geometry.maxScroll / 2)
    expect(top).toBeCloseTo(geometry.maxTop / 2)
    expect(scrollFromTop(geometry, top)).toBeCloseTo(geometry.maxScroll / 2)
  })
  it('draws the rows in view with overscan, inside the dataset', () => {
    expect(rowsInView(total, 0, 32, 800, 6)).toEqual({ first: 0, last: 31 })
    expect(rowsInView(total, 6_482_300 * 32 + 10, 32, 800, 6)).toEqual({ first: 6_482_294, last: 6_482_331 })
    expect(rowsInView(total, geometry.maxTop, 32, 800, 6).last).toBe(total - 1)
    expect(rowsInView(0, 0, 32, 800, 6)).toEqual({ first: 0, last: -1 })
  })
})
