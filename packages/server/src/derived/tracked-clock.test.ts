import { describe, expect, it } from 'vitest'
import { trackedClock } from './tracked-clock'

const now = new Date('2026-11-10T12:00:00.000Z')

describe('trackedClock', () => {
  it('records when an "older than" check flips, the earliest of several', () => {
    const { clock, flipsAt } = trackedClock(now)
    expect(clock.olderThan('2026-11-10T11:00:00.000Z', '2 hours')).toBe(false)
    expect(clock.isPast(new Date('2026-11-10T15:00:00.000Z'))).toBe(false)
    expect(flipsAt()).toEqual(new Date('2026-11-10T13:00:00.000Z'))
  })

  it('records nothing for a check that has flipped already, nor for now()', () => {
    const { clock, flipsAt } = trackedClock(now)
    expect(clock.olderThan('2026-11-10T09:00:00.000Z', '2 hours')).toBe(true)
    expect(clock.now()).toEqual(now)
    expect(flipsAt()).toBeUndefined()
  })

  it('refuses what is not a time', () => {
    expect(() => trackedClock(now).clock.isPast('soon')).toThrow('not a time')
  })
})
