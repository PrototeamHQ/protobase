import { describe, expect, it } from 'vitest'
import { anchoredTop, cardColumns, cardWidth, recordRange } from './card-layout'

describe('card layout', () => {
  it('fits as many 15rem cards with their gaps as the width holds, at least one', () => {
    expect(cardColumns(0)).toBe(1)
    expect(cardColumns(239)).toBe(1)
    expect(cardColumns(491)).toBe(1)
    expect(cardColumns(492)).toBe(2)
    expect(cardColumns(995)).toBe(3)
    expect(cardColumns(996)).toBe(4)
    expect(cardWidth(996, 4)).toBe(240)
  })

  it('turns card rows into the records they hold, the last row cut at the total', () => {
    expect(recordRange(0, 2, 4, 100)).toEqual({ start: 0, end: 11 })
    expect(recordRange(24, 26, 4, 101)).toEqual({ start: 96, end: 100 })
    expect(recordRange(0, 0, 4, 0)).toEqual({ start: 0, end: 0 })
  })

  it('keeps the first record of the top row in view when the columns change', () => {
    // Row 10 of 4 columns starts at record 40, which is in row 13 of 3 columns
    expect(anchoredTop(10 * 300 + 120, { columns: 4, rowHeight: 300 }, { columns: 3, rowHeight: 350 })).toBe(13 * 350)
    expect(anchoredTop(10 * 300, { columns: 4, rowHeight: 300 }, { columns: 5, rowHeight: 300 })).toBe(8 * 300)
  })

  it('keeps the place within the row when only the row height changes', () => {
    expect(anchoredTop(10.5 * 300, { columns: 4, rowHeight: 300 }, { columns: 4, rowHeight: 320 })).toBe(10.5 * 320)
  })
})
