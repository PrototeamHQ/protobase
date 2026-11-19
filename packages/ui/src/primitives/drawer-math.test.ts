import { describe, expect, it } from 'vitest'
import { backdropAlpha, backdropSlope, dragProgress, drawerBandLimit, drawerSlope, endsOpen, rubberBand, startsDrag, withinAngle } from './drawer-math'

describe('drawer math, as the native drawer has it', () => {
  it('ends where a fast release heads, else past half way', () => {
    expect(endsOpen(0.2, 600)).toBe(true)
    expect(endsOpen(0.9, -600)).toBe(false)
    expect(endsOpen(0.6, 100)).toBe(true)
    expect(endsOpen(0.4, -100)).toBe(false)
    expect(endsOpen(0.5, 0)).toBe(true)
  })

  it('gives past open as a rubber band that never reaches its limit', () => {
    expect(rubberBand(0)).toBe(0)
    expect(rubberBand(-10)).toBe(0)
    expect(rubberBand(40)).toBeGreaterThan(0)
    expect(rubberBand(10_000)).toBeLessThan(drawerBandLimit)
    expect(rubberBand(20)).toBeLessThan(rubberBand(40))
  })

  it('dims the backdrop with the progress, up to its dim', () => {
    expect(backdropAlpha(0)).toBe(0)
    expect(backdropAlpha(1)).toBeCloseTo(0.35)
    expect(backdropAlpha(2)).toBeCloseTo(0.35)
    expect(backdropAlpha(-1)).toBe(0)
  })

  it('starts a drag only past the slop and within the angle of its axis', () => {
    expect(startsDrag(9, 0, drawerSlope)).toBe(false)
    expect(startsDrag(12, 5, drawerSlope)).toBe(true)
    expect(startsDrag(10, 8, drawerSlope)).toBe(false)
    expect(startsDrag(10, 9, backdropSlope)).toBe(true)
    expect(withinAngle(0, 0, backdropSlope)).toBe(false)
  })

  it('follows the finger, stops at closed, and rubber-bands past open', () => {
    expect(dragProgress(1, -150, 300)).toBeCloseTo(0.5)
    expect(dragProgress(0, -50, 300)).toBe(0)
    expect(dragProgress(1, 100, 300)).toBeGreaterThan(1)
    expect(dragProgress(1, 100, 300)).toBeLessThan(1 + drawerBandLimit / 300)
  })
})
