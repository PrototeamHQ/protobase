import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startCleanupTimer } from './cleanup-timer'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('the file cleanup timer', () => {
  it('runs on its interval, one run at a time, and reports failures without stopping', async () => {
    let finish = () => {}
    const run = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    const report = vi.fn()
    const timer = startCleanupTimer(run, 10, report)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(run).toHaveBeenCalledTimes(1)
    finish()
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(run).toHaveBeenCalledTimes(2)

    run.mockImplementationOnce(() => Promise.reject(new Error('disk gone')))
    finish()
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(report).toHaveBeenCalledWith(new Error('disk gone'))
    await timer.stop()
    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(run).toHaveBeenCalledTimes(3)
  })
})
