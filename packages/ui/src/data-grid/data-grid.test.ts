import { describe, expect, it } from 'vitest'
import { gridGeometry, maxContentHeight, rowOffset, rowsInView, scrollFromTop, topFromScroll } from './geometry'
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
  it('forgets every page but the kept ones', () => {
    const cache = createPageCache<number>(1, 5)
    for (const page of [0, 1, 2, 3]) cache.setPage(page, [page])
    cache.keepOnly([1, 2])
    expect([0, 1, 2, 3].map((page) => cache.hasPage(page))).toEqual([false, true, true, false])
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
  it('moves one to one before and after the capped range', () => {
    expect(topFromScroll(geometry, -120)).toBe(-120)
    expect(topFromScroll(geometry, geometry.maxScroll + 50)).toBeCloseTo(geometry.maxTop + 50)
    expect(scrollFromTop(geometry, geometry.maxTop + 50)).toBeCloseTo(geometry.maxScroll + 50)
    const uncapped = gridGeometry(1000, 32, 800)
    expect(topFromScroll(uncapped, 4_000)).toBe(4_000)
    expect(scrollFromTop(uncapped, -10)).toBe(-10)
  })
  it('draws a row at its own place, or in a capped list relative to the view', () => {
    expect(rowOffset(gridGeometry(1000, 32, 800), 10, 0, 0)).toBe(320)
    const position = geometry.maxScroll / 2
    const top = topFromScroll(geometry, position)
    const index = Math.floor(top / 32)
    expect(rowOffset(geometry, index, top, position) - position).toBeCloseTo(index * 32 - top)
  })
  it('draws the rows in view with overscan, inside the dataset', () => {
    expect(rowsInView(total, 0, 32, 800, 6)).toEqual({ first: 0, last: 31 })
    expect(rowsInView(total, 6_482_300 * 32 + 10, 32, 800, 6)).toEqual({ first: 6_482_294, last: 6_482_331 })
    expect(rowsInView(total, geometry.maxTop, 32, 800, 6).last).toBe(total - 1)
    expect(rowsInView(0, 0, 32, 800, 6)).toEqual({ first: 0, last: -1 })
    // A list below the view or scrolled past draws nothing
    expect(rowsInView(100, -2_000, 32, 800, 6)).toEqual({ first: 0, last: -1 })
    expect(rowsInView(100, 10_000, 32, 800, 6)).toEqual({ first: 100, last: 99 })
  })
})
