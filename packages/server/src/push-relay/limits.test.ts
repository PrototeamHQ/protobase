import { describe, expect, it } from 'vitest'
import { hourStart, secondsToNextHour } from './limits'

describe('the hourly send window', () => {
  it('starts at the UTC clock hour, and Retry-After counts to the moment the next window starts', () => {
    for (const at of [Date.UTC(2026, 10, 8, 10, 59, 30), Date.UTC(2026, 10, 8, 10, 59, 59, 999), Date.UTC(2026, 10, 8, 10, 0, 0, 1), Date.UTC(2026, 10, 8, 10, 30)]) {
      const retry = at + secondsToNextHour(at) * 1000
      expect(hourStart(at)).toEqual(new Date(Date.UTC(2026, 10, 8, 10)))
      expect(hourStart(retry)).toEqual(new Date(Date.UTC(2026, 10, 8, 11)))
      expect(hourStart(retry - 1000)).toEqual(new Date(Date.UTC(2026, 10, 8, 10)))
    }
  })

  it('waits at least a second, and a whole hour from the hour itself', () => {
    expect(secondsToNextHour(Date.UTC(2026, 10, 8, 10, 59, 59, 999))).toBe(1)
    expect(secondsToNextHour(Date.UTC(2026, 10, 8, 10))).toBe(3600)
  })
})
