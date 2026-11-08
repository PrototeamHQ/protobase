import { describe, expect, it } from 'vitest'
import { rowWindow } from './row-window'

describe('rowWindow', () => {
  it('draws the cards in view and three more on each side', () => {
    // Cards step 268px: a view 600px wide at the start shows cards 0 to 2
    expect(rowWindow(0, 600, 100)).toEqual({ start: 0, end: 6 })
    // Scrolled 2680px, card 10 is first in view, and part of card 12 is the last
    expect(rowWindow(2680, 600, 100)).toEqual({ start: 7, end: 16 })
  })

  it('steps by the view in a view narrower than a card, where each card is as wide as the view', () => {
    // Cards 200px wide step 212px: scrolled 2120px, card 10 fills the view
    expect(rowWindow(2120, 200, 100)).toEqual({ start: 7, end: 14 })
  })

  it('draws nothing past either end, and nothing of an empty row', () => {
    expect(rowWindow(26_000, 600, 100)).toEqual({ start: 94, end: 100 })
    expect(rowWindow(-40, 600, 4)).toEqual({ start: 0, end: 4 })
    expect(rowWindow(0, 600, 0)).toEqual({ start: 0, end: 0 })
  })
})
