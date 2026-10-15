import { describe, expect, it } from 'vitest'
import { withMeasuredHeight } from './measured-heights'

describe('measured card heights', () => {
  it('keeps the height of each width, so a width the cards come back to keeps its height', () => {
    let heights = withMeasuredHeight(new Map(), 245.5, 332)
    heights = withMeasuredHeight(heights, 244, 331)
    expect(heights.get(245.5)).toBe(332)
    expect(heights.get(244)).toBe(331)
  })

  it('keeps the tallest card measured at a width, and the same heights when nothing is taller', () => {
    const heights = withMeasuredHeight(new Map(), 244, 331)
    expect(withMeasuredHeight(heights, 244, 300)).toBe(heights)
    expect(withMeasuredHeight(heights, 244, 340).get(244)).toBe(340)
  })

  it('forgets the widths measured longest ago past eight', () => {
    let heights = withMeasuredHeight(new Map(), 100, 1)
    for (let width = 101; width <= 108; width++) heights = withMeasuredHeight(heights, width, 1)
    expect(heights.size).toBe(8)
    expect(heights.has(100)).toBe(false)
    expect(heights.has(108)).toBe(true)
  })
})
