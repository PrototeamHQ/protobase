import { describe, expect, it } from 'vitest'
import { gridHeights } from './grid-heights'

describe('gridHeights', () => {
  it('keeps the usual pixel heights at a 16px root', () => {
    expect(gridHeights(16, { compact: false, withBelow: false })).toEqual({ header: 32, row: 36, footer: 36 })
    expect(gridHeights(16, { compact: true, withBelow: true }).row).toBe(60)
  })

  it('grows every height, the room below a cell included, with the root text size', () => {
    expect(gridHeights(32, { compact: false, withBelow: true })).toEqual({ header: 64, row: 136, footer: 72 })
  })
})
