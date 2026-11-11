import { describe, expect, it } from 'vitest'
import { closesOnRelease, dragsInsteadOfScroll, releaseVelocity, sheetOffset } from './sheet-drag'

describe('sheetOffset', () => {
  it('follows the finger down', () => {
    expect(sheetOffset(0)).toBe(0)
    expect(sheetOffset(120)).toBe(120)
  })

  it('gives a little upwards and never past its limit', () => {
    expect(sheetOffset(-10)).toBeLessThan(0)
    expect(sheetOffset(-10)).toBeGreaterThan(-10)
    expect(sheetOffset(-1000)).toBeGreaterThanOrEqual(-24)
  })
})

describe('releaseVelocity', () => {
  it('reads the speed of the last 100 ms only', () => {
    const samples = [
      { y: 0, time: 0 },
      { y: 10, time: 500 },
      { y: 20, time: 550 },
      { y: 70, time: 600 },
    ]
    expect(releaseVelocity(samples)).toBe(0.6)
  })

  it('is negative moving up, and zero without movement in time', () => {
    expect(releaseVelocity([{ y: 100, time: 0 }, { y: 50, time: 50 }])).toBe(-1)
    expect(releaseVelocity([{ y: 100, time: 0 }])).toBe(0)
    expect(releaseVelocity([])).toBe(0)
  })
})

describe('closesOnRelease', () => {
  it('closes on a fling down from any distance past the slop', () => {
    expect(closesOnRelease(30, 600, 0.8)).toBe(true)
  })

  it('closes when let go slowly past 30% of its height', () => {
    expect(closesOnRelease(200, 600, 0)).toBe(true)
    expect(closesOnRelease(150, 600, 0.1)).toBe(false)
  })

  it('springs back when the finger was moving up, or barely moved', () => {
    expect(closesOnRelease(300, 600, -0.4)).toBe(false)
    expect(closesOnRelease(4, 600, 2)).toBe(false)
  })
})

describe('dragsInsteadOfScroll', () => {
  it('drags when the content is at its top and the finger moves down', () => {
    expect(dragsInsteadOfScroll(0, 2, 10)).toBe(true)
  })

  it('scrolls when the content is scrolled, the finger moves up or mostly sideways', () => {
    expect(dragsInsteadOfScroll(40, 0, 10)).toBe(false)
    expect(dragsInsteadOfScroll(0, 0, -10)).toBe(false)
    expect(dragsInsteadOfScroll(0, 20, 10)).toBe(false)
  })
})
