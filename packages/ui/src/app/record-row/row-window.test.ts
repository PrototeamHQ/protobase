import { describe, expect, it } from 'vitest'
import { rowOffset, rowWindow } from './row-window'

describe('rowWindow', () => {
  it('draws the cards in view and three more on each side', () => {
    // Cards step 268px: a view 600px wide at the start shows cards 0 to 2
    expect(rowWindow(0, 600, 100)).toEqual({ start: 0, end: 6 })
    // Scrolled 2680px, card 10 is first in view, and part of card 12 is the last
    expect(rowWindow(2680, 600, 100)).toEqual({ start: 7, end: 16 })
  })

  it('draws nothing past either end, and nothing of an empty row', () => {
    expect(rowWindow(26_000, 600, 100)).toEqual({ start: 94, end: 100 })
    expect(rowWindow(-40, 600, 4)).toEqual({ start: 0, end: 4 })
    expect(rowWindow(0, 600, 0)).toEqual({ start: 0, end: 0 })
  })
})

describe('rowOffset', () => {
  it('is the width of the cards before, with their gaps', () => {
    expect(rowOffset(0)).toBe(0)
    expect(rowOffset(3)).toBe(804)
  })
})
