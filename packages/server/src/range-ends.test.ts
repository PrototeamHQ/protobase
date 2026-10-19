import { describe, expect, it } from 'vitest'
import { dayIn, rangeEnd, rangeStart } from './range-ends'
import { HttpProblem } from './problem'

// 23:30 on 18 October in UTC is already 19 October in Amsterdam and still 18 October in New York
const now = Date.parse('2026-10-18T23:30:00Z')

describe('range ends', () => {
  it('reads the day in the viewer zone', () => {
    expect(dayIn(now, 'Europe/Amsterdam')).toBe('2026-10-19')
    expect(dayIn(now, 'America/New_York')).toBe('2026-10-18')
  })

  it('ends a range of dates after the viewer today, so today is in', () => {
    expect(rangeEnd('date', now, 'Europe/Amsterdam')).toBe('2026-10-20')
    expect(rangeEnd('date', now, 'UTC')).toBe('2026-10-19')
    expect(rangeEnd('date', Date.parse('2026-12-31T12:00:00Z'), 'UTC')).toBe('2027-01-01')
  })

  it('starts a range of dates on the viewer day', () => {
    expect(rangeStart('date', now, 'Europe/Amsterdam')).toBe('2026-10-19')
    expect(rangeStart('date', now, 'America/New_York')).toBe('2026-10-18')
  })

  it('keeps a timestamp range on the instants', () => {
    expect(rangeEnd('timestamp', now, 'Europe/Amsterdam')).toBe('2026-10-18T23:30:00.000Z')
    expect(rangeStart('timestamp', now, 'Europe/Amsterdam')).toBe('2026-10-18T23:30:00.000Z')
  })

  it('refuses an unknown zone', () => {
    expect(() => dayIn(now, 'Mars/Base')).toThrow(HttpProblem)
  })
})
