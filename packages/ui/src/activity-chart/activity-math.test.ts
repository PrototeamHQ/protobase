import { describe, expect, it } from 'vitest'
import { halfOverHalfDelta, totalCount } from './activity-math'

const series = (counts: number[]) => counts.map((count, index) => ({ at: index, count }))

describe('activity math', () => {
  it('sums counts', () => {
    expect(totalCount(series([1, 2, 3]))).toBe(6)
  })
  it('compares halves', () => {
    expect(halfOverHalfDelta(series([10, 10, 15, 15]))).toBe(50)
    expect(halfOverHalfDelta(series([0, 0, 5, 5]))).toBe(0)
  })
})
