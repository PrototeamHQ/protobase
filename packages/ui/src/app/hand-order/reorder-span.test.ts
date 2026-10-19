import { describe, expect, it } from 'vitest'
import { reorderSpan } from './reorder-span'

describe('reorderSpan', () => {
  it('is only the records that moved when the values are 1, 2, 3, ...', () => {
    // 1 moved from the first place to the third of five
    expect(reorderSpan([2, 3, 1, 4, 5], 0, 2)).toEqual({ first: 0, last: 2, start: 1 })
    // 5 moved from the last place to the second
    expect(reorderSpan([1, 5, 2, 3, 4], 1, 4)).toEqual({ first: 1, last: 4, start: 2 })
    // A swap deep in a long list
    const ranks = Array.from({ length: 1000 }, (_, index) => index + 1)
    ;[ranks[700], ranks[701]] = [ranks[701]!, ranks[700]!]
    expect(reorderSpan(ranks, 700, 701)).toEqual({ first: 700, last: 701, start: 701 })
  })

  it('writes the moved record alone when there is room between its neighbours', () => {
    expect(reorderSpan([10, 50, 20, 30], 1, 3)).toEqual({ first: 1, last: 3, start: 11 })
    expect(reorderSpan([10, 30, 20], 1, 1)).toEqual({ first: 1, last: 1, start: 11 })
  })

  it('reaches on until the next record ranks above the stretch', () => {
    expect(reorderSpan([1, 9, 2, 3, 4, 8], 1, 1)).toEqual({ first: 1, last: 4, start: 2 })
  })

  it('starts earlier when the records before it do not rise', () => {
    expect(reorderSpan([1, 3, 3, 9, 4], 3, 4)).toEqual({ first: 2, last: 4, start: 4 })
    expect(reorderSpan([null, 1, 3, 2], 2, 3)).toEqual({ first: 0, last: 3, start: 1 })
  })

  it('reaches to the end when the records after it do not rise', () => {
    expect(reorderSpan([2, 1, 3, 5, 5, 5], 0, 1)).toEqual({ first: 0, last: 5, start: 1 })
    expect(reorderSpan([2, 1, 3, null], 0, 1)).toEqual({ first: 0, last: 3, start: 1 })
  })
})
