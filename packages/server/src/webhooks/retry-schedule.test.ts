import { describe, expect, it } from 'vitest'
import { maxTries, nextRetryDelay, retryAfterMs } from './retry-schedule'

const middle = () => 0.5

describe('nextRetryDelay', () => {
  it('follows the Standard Webhooks schedule, about three days over 10 tries', () => {
    const delays = Array.from({ length: maxTries }, (_, index) => nextRetryDelay(index + 1, undefined, middle))
    expect(delays.map((delay) => (delay === undefined ? delay : delay / 1000))).toEqual([5, 300, 1800, 7200, 18000, 36000, 50400, 72000, 86400, undefined])
    expect(delays.reduce((sum: number, delay) => sum + (delay ?? 0), 0) / 3_600_000).toBeCloseTo(75.6, 1)
  })

  it('adds up to 10% jitter, and waits as long as Retry-After asks, up to a day', () => {
    expect(nextRetryDelay(1, undefined, () => 0)).toBe(4500)
    expect(nextRetryDelay(1, undefined, () => 1)).toBe(5500)
    expect(nextRetryDelay(1, 60_000, middle)).toBe(60_000)
    expect(nextRetryDelay(2, 1000, middle)).toBe(300_000)
    expect(nextRetryDelay(1, 7 * 86_400_000, middle)).toBe(86_400_000)
  })
})

describe('retryAfterMs', () => {
  it('reads seconds and HTTP dates', () => {
    expect(retryAfterMs('120')).toBe(120_000)
    expect(retryAfterMs('Sun, 11 Oct 2026 10:00:30 GMT', Date.parse('2026-10-11T10:00:00Z'))).toBe(30_000)
    expect(retryAfterMs(null)).toBeUndefined()
    expect(retryAfterMs('soon')).toBeUndefined()
  })
})
