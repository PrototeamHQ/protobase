import { describe, expect, it } from 'vitest'
import { moveActive } from './global-search'

describe('moveActive', () => {
  it('starts at the first result going down and the last going up', () => {
    expect([moveActive(-1, 3, 1), moveActive(-1, 3, -1)]).toEqual([0, 2])
  })

  it('wraps around both ends', () => {
    expect([moveActive(2, 3, 1), moveActive(0, 3, -1), moveActive(1, 3, 1)]).toEqual([0, 2, 2])
  })

  it('has nothing to highlight without results', () => {
    expect(moveActive(0, 0, 1)).toBe(-1)
  })
})
