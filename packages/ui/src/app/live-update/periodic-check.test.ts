import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkPeriodically, liveUpdateCheckIntervalMs } from './periodic-check'

afterEach(() => vi.useRealTimers())

describe('checkPeriodically', () => {
  it('checks at once and every interval while in view, and not once stopped', () => {
    vi.useFakeTimers()
    const check = vi.fn()
    let inView = true
    const stop = checkPeriodically(check, () => inView)
    expect(check).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(liveUpdateCheckIntervalMs)
    expect(check).toHaveBeenCalledTimes(2)
    inView = false
    vi.advanceTimersByTime(liveUpdateCheckIntervalMs)
    expect(check).toHaveBeenCalledTimes(2)
    inView = true
    stop()
    vi.advanceTimersByTime(liveUpdateCheckIntervalMs)
    expect(check).toHaveBeenCalledTimes(2)
  })
})
