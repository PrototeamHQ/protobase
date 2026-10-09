import { describe, expect, it } from 'vitest'
import { planMove, type PositionStep } from './reposition'

const lines = [10, 20, 30, 40, 50].map((position, index) => ({ id: `l${index}`, position }))

/** Applies the steps in order and fails if two lines ever share a position, as the database would. */
const apply = (steps: PositionStep[]) => {
  const positions = new Map(lines.map((line) => [line.id, line.position]))
  for (const step of steps) {
    expect([...positions.entries()].some(([id, position]) => id !== step.id && position === step.position)).toBe(false)
    positions.set(step.id, step.position)
  }
  return [...positions.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id)
}

describe('planMove', () => {
  it('moves a line down and shifts the ones it passes up', () => {
    const steps = planMove(lines, 1, 3)
    expect(steps).toEqual([
      { id: 'l1', position: 51 },
      { id: 'l2', position: 20 },
      { id: 'l3', position: 30 },
      { id: 'l1', position: 40 },
    ])
    expect(apply(steps)).toEqual(['l0', 'l2', 'l3', 'l1', 'l4'])
  })

  it('moves a line up and shifts the ones it passes down', () => {
    const steps = planMove(lines, 3, 1)
    expect(steps).toEqual([
      { id: 'l3', position: 51 },
      { id: 'l2', position: 40 },
      { id: 'l1', position: 30 },
      { id: 'l3', position: 20 },
    ])
    expect(apply(steps)).toEqual(['l0', 'l3', 'l1', 'l2', 'l4'])
  })

  it('touches only the lines between the two indexes', () => {
    expect(new Set(planMove(lines, 0, 1).map((step) => step.id))).toEqual(new Set(['l0', 'l1']))
  })

  it('does nothing for a move to the same place or out of range', () => {
    expect(planMove(lines, 2, 2)).toEqual([])
    expect(planMove(lines, 2, 9)).toEqual([])
    expect(planMove(lines, 7, 0)).toEqual([])
  })

  it('moves to the ends', () => {
    expect(apply(planMove(lines, 0, 4))).toEqual(['l1', 'l2', 'l3', 'l4', 'l0'])
    expect(apply(planMove(lines, 4, 0))).toEqual(['l4', 'l0', 'l1', 'l2', 'l3'])
  })
})
