import { describe, expect, it } from 'vitest'
import { galleryTiles, keyStep, steppedPhoto, swipeStep } from './gallery-layout'

describe('galleryTiles', () => {
  it('draws every photo up to three, three of four, five at most, and counts the rest on the last tile', () => {
    expect([0, 1, 2, 3, 4, 5, 24].map(galleryTiles)).toEqual([
      { shown: 0, more: 0 },
      { shown: 1, more: 0 },
      { shown: 2, more: 0 },
      { shown: 3, more: 0 },
      { shown: 3, more: 1 },
      { shown: 5, more: 0 },
      { shown: 5, more: 19 },
    ])
  })
})

describe('swipeStep', () => {
  it('takes a sideways drag leftwards to the next photo and rightwards to the previous one', () => {
    expect(swipeStep(-80, 10)).toBe(1)
    expect(swipeStep(80, -10)).toBe(-1)
  })

  it('ignores a short drag and one that is mostly up or down', () => {
    expect(swipeStep(-20, 0)).toBe(0)
    expect(swipeStep(-60, 90)).toBe(0)
  })
})

describe('keyStep', () => {
  it('steps with the arrow keys alone', () => {
    expect(['ArrowRight', 'ArrowLeft', 'Enter'].map(keyStep)).toEqual([1, -1, 0])
  })
})

describe('steppedPhoto', () => {
  it('steps through the photos and stops at the first and the last', () => {
    expect(steppedPhoto(2, 1, 8)).toBe(3)
    expect(steppedPhoto(7, 1, 8)).toBe(7)
    expect(steppedPhoto(0, -1, 8)).toBe(0)
    expect(steppedPhoto(0, 0, 1)).toBe(0)
  })
})
