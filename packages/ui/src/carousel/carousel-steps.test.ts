import { describe, expect, it } from 'vitest'
import { scrolledSlide, shownSlide } from './carousel-steps'

describe('shownSlide', () => {
  it('steps forward and wraps from the last to the first', () => {
    expect([0, 1, 2, 3, 4].map((step) => shownSlide(step, 3))).toEqual([0, 1, 2, 0, 1])
  })

  it('steps back from the first to the last', () => {
    expect([-1, -2, -3, -4].map((step) => shownSlide(step, 3))).toEqual([2, 1, 0, 2])
  })

  it('stays on the first with one slide or none', () => {
    expect(shownSlide(5, 1)).toBe(0)
    expect(shownSlide(-2, 0)).toBe(0)
  })
})

describe('scrolledSlide', () => {
  it('is the slide mostly in view, part way through a swipe', () => {
    expect([0, 100, 159, 161, 320, 470].map((left) => scrolledSlide(left, 320, 3))).toEqual([0, 0, 0, 1, 1, 1])
  })

  it('stays within the slides when the track overscrolls', () => {
    expect(scrolledSlide(-40, 320, 3)).toBe(0)
    expect(scrolledSlide(2000, 320, 3)).toBe(2)
  })

  it('is the first before the track has a width or slides', () => {
    expect(scrolledSlide(100, 0, 3)).toBe(0)
    expect(scrolledSlide(100, 320, 0)).toBe(0)
  })
})
