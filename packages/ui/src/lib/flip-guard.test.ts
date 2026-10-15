import { describe, expect, it } from 'vitest'
import { createFlipGuard } from './flip-guard'

// Feeds `values` to a guard a frame apart and returns what it laid out with
const frames = (guard: ReturnType<typeof createFlipGuard>, values: number[], start = 0) => values.map((value, index) => guard(value, start + index * 16))

describe('flip guard', () => {
  it('follows a measure that changes to new values, as on a resize of the window', () => {
    const guard = createFlipGuard({ onHold: () => {} })
    expect(frames(guard, [1000, 990, 980, 970, 960, 950, 940])).toEqual([1000, 990, 980, 970, 960, 950, 940])
  })

  it('holds the smaller value once a width keeps flipping between two, as with and without a scrollbar', () => {
    const holds: [number, number[]][] = []
    const guard = createFlipGuard({ onHold: (held, values) => holds.push([held, values]) })
    expect(frames(guard, [2555, 2540, 2555, 2540, 2555, 2540, 2555, 2540, 2555])).toEqual([2555, 2540, 2555, 2540, 2540, 2540, 2540, 2540, 2540])
    expect(holds).toEqual([[2540, [2555, 2540]]])
  })

  it('holds among the values it flipped between, not the ones it had before', () => {
    const holds: number[][] = []
    const guard = createFlipGuard({ onHold: (_, values) => holds.push(values) })
    expect(frames(guard, [700, 760, 808, 793, 808, 793, 808])).toEqual([700, 760, 808, 793, 808, 793, 793])
    expect(holds).toEqual([[808, 793]])
  })

  it('holds the smallest of a loop through three values', () => {
    const guard = createFlipGuard({ onHold: () => {} })
    expect(frames(guard, [30, 20, 10, 30, 20, 10, 30])).toEqual([30, 20, 10, 30, 10, 10, 10])
  })

  it('lets go once the measure takes another value, and follows it', () => {
    const guard = createFlipGuard({ onHold: () => {} })
    frames(guard, [2555, 2540, 2555, 2540, 2555])
    expect(guard(1800, 200)).toBe(1800)
    expect(guard(1785, 216)).toBe(1785)
  })

  it('counts only comebacks within its window, so a width toggled now and then is followed', () => {
    const guard = createFlipGuard({ windowMs: 1000, onHold: () => {} })
    expect([0, 1, 2, 3, 4, 5].map((second) => guard(second % 2 ? 1265 : 1280, second * 1000))).toEqual([1280, 1265, 1280, 1265, 1280, 1265])
  })

  it('holds after as many comebacks as it is told', () => {
    const guard = createFlipGuard({ comebacks: 1, onHold: () => {} })
    expect(frames(guard, [10, 20, 10, 20])).toEqual([10, 20, 10, 10])
  })
})
