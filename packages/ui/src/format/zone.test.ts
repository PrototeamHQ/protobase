import { describe, expect, it } from 'vitest'
import { dayIn, instantAt, startOfDayIn, zoneLabel, zoneOffset } from './zone'

describe('zone', () => {
  it("reads a zone's offset from UTC, summer and winter time", () => {
    expect(zoneOffset(Date.UTC(2026, 6, 1, 12), 'Europe/Amsterdam')).toBe(2 * 3_600_000)
    expect(zoneOffset(Date.UTC(2026, 11, 1, 12), 'Europe/Amsterdam')).toBe(3_600_000)
    expect(zoneOffset(Date.UTC(2026, 11, 1, 12), 'UTC')).toBe(0)
    expect(zoneOffset(Date.UTC(2026, 11, 1, 12), 'America/New_York')).toBe(-5 * 3_600_000)
  })

  it('finds the day an instant falls on in a zone', () => {
    expect(dayIn(Date.parse('2026-10-14T22:30:00Z'), 'Europe/Amsterdam')).toBe('2026-10-15')
    expect(dayIn(Date.parse('2026-10-14T22:30:00Z'), 'UTC')).toBe('2026-10-14')
    expect(dayIn(Date.parse('2026-10-15T02:00:00Z'), 'America/New_York')).toBe('2026-10-14')
  })

  it("finds a day's local midnight, on the days the clock changes too", () => {
    expect(new Date(startOfDayIn('2026-10-15', 'Europe/Amsterdam')).toISOString()).toBe('2026-10-14T22:00:00.000Z')
    expect(new Date(startOfDayIn('2026-10-25', 'Europe/Amsterdam')).toISOString()).toBe('2026-10-24T22:00:00.000Z')
    expect(new Date(startOfDayIn('2026-10-26', 'Europe/Amsterdam')).toISOString()).toBe('2026-10-25T23:00:00.000Z')
    expect(new Date(startOfDayIn('2026-03-29', 'Europe/Amsterdam')).toISOString()).toBe('2026-03-28T23:00:00.000Z')
    expect(new Date(startOfDayIn('2026-10-15', 'UTC')).toISOString()).toBe('2026-10-15T00:00:00.000Z')
  })

  it('finds the instant a wall clock reads a time', () => {
    expect(new Date(instantAt(Date.UTC(2026, 9, 29, 9, 30), 'Europe/Amsterdam')).toISOString()).toBe('2026-10-29T08:30:00.000Z')
  })

  it('labels a zone with its offset at the instant shown', () => {
    expect(zoneLabel(Date.UTC(2026, 6, 1), 'Europe/Amsterdam')).toBe('Europe/Amsterdam (GMT+2)')
    expect(zoneLabel(Date.UTC(2026, 11, 1), 'Europe/Amsterdam')).toBe('Europe/Amsterdam (GMT+1)')
    expect(zoneLabel(Date.UTC(2026, 11, 1), 'UTC')).toBe('UTC')
  })
})
