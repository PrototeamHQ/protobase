import { describe, expect, it } from 'vitest'
import { countTotal } from './related-count'

describe('countTotal', () => {
  it('adds the counts up, and is 0 with none or only empty ones', () => {
    expect(countTotal([3, 0, 4])).toBe(7)
    expect(countTotal([])).toBe(0)
    expect(countTotal([0])).toBe(0)
  })

  it('is unknown while a count loads, and uncounted once one fails, never 0', () => {
    expect(countTotal([3, undefined])).toBeUndefined()
    expect(countTotal([3, null, undefined])).toBeNull()
  })
})
