import { describe, expect, it } from 'vitest'
import { gridGeometry, maxContentHeight, scrollFromTop, topFromScroll, windowFor } from './geometry'
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
  it('keeps the window inside the dataset', () => {
    expect(windowFor(total, 0, 32)).toEqual({ base: 0, count: 5000 })
    const end = windowFor(total, geometry.maxTop, 32)
    expect(end.base + end.count).toBe(total)
    const middle = windowFor(total, 6_482_300 * 32, 32)
    expect(6_482_300 - middle.base).toBeLessThan(middle.count)
  })
})
