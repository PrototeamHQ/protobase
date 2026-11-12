import { describe, expect, it } from 'vitest'
import { maxCanvasPixels, pageSize } from './page-size'

describe('a PDF page on screen', () => {
  it('fills the width it is given, at the height its shape needs', () => {
    expect(pageSize(612, 792, 306, 1)).toEqual({ scale: 0.5, cssHeight: 396, canvasWidth: 306, canvasHeight: 396, pixelRatio: 1 })
  })

  it("draws on the screen's own pixels, for a sharp page", () => {
    expect(pageSize(612, 792, 306, 2)).toMatchObject({ canvasWidth: 612, canvasHeight: 792, pixelRatio: 2 })
  })

  it('keeps a canvas within the pixels browsers allow, drawing a huge page less sharp', () => {
    const size = pageSize(14400, 14400, 4000, 3)
    expect(size.canvasWidth * size.canvasHeight).toBeLessThanOrEqual(maxCanvasPixels)
    expect(size).toMatchObject({ canvasWidth: 4096, canvasHeight: 4096, cssHeight: 4000 })
  })
})
