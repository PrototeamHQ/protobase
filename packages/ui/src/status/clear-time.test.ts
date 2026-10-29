import { describe, expect, it } from 'vitest'
import { clearTimeOf, localInputValue } from './clear-time'

// A Wednesday afternoon in the test's own time zone, whatever it is.
const now = new Date(2026, 9, 28, 14, 20)
const local = (...parts: [number, number, number, number?, number?]) => new Date(...parts).toISOString()

describe('clearTimeOf', () => {
  it('never clears for never', () => {
    expect(clearTimeOf('never', now)).toBeNull()
  })

  it('clears after a while', () => {
    expect(clearTimeOf('thirty_minutes', now)).toBe(local(2026, 9, 28, 14, 50))
    expect(clearTimeOf('one_hour', now)).toBe(local(2026, 9, 28, 15, 20))
    expect(clearTimeOf('four_hours', now)).toBe(local(2026, 9, 28, 18, 20))
  })

  it("clears at midnight at the end of today, in the person's own time zone", () => {
    expect(clearTimeOf('today', now)).toBe(local(2026, 9, 29))
    expect(clearTimeOf('today', new Date(2026, 11, 31, 23, 59))).toBe(local(2027, 0, 1))
  })

  it('clears on Sunday night at the end of this week, a Sunday itself included', () => {
    expect(clearTimeOf('this_week', now)).toBe(local(2026, 10, 2))
    expect(clearTimeOf('this_week', new Date(2026, 10, 1, 9))).toBe(local(2026, 10, 2))
    expect(clearTimeOf('this_week', new Date(2026, 10, 2, 9))).toBe(local(2026, 10, 9))
  })

  it('clears at the date and time picked, and has none while the field holds none', () => {
    expect(clearTimeOf('custom', now, '2026-10-28T16:05')).toBe(local(2026, 9, 28, 16, 5))
    expect(clearTimeOf('custom', now, '')).toBeUndefined()
    expect(clearTimeOf('custom', now, 'tomorrow')).toBeUndefined()
    expect(clearTimeOf('custom', now, '2026-13-45T99:99')).toBeUndefined()
  })
})

describe('localInputValue', () => {
  it("shows a time to the minute in the person's own time zone, as the picker's field reads it back", () => {
    const iso = local(2026, 9, 28, 9, 5)
    expect(localInputValue(iso)).toBe('2026-10-28T09:05')
    expect(clearTimeOf('custom', now, localInputValue(iso))).toBe(iso)
  })
})
