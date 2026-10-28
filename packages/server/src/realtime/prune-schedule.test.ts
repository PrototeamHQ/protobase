import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pruneSchedule, realtimePruneIntervalMs } from './prune-schedule'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

const pending = () => {
  let finish = () => {}
  const step = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve })).mockResolvedValue(undefined)
  return { step, finish: () => finish() }
}

describe('pruneSchedule', () => {
  it('runs its steps once as it starts, then every 10 minutes', async () => {
    const first = vi.fn(async () => {})
    const second = vi.fn(async () => {})
    const schedule = pruneSchedule([first, second], vi.fn())
    await vi.advanceTimersByTimeAsync(0)
    expect(realtimePruneIntervalMs).toBe(10 * 60_000)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(realtimePruneIntervalMs - 1)
    expect(first).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(first).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenCalledTimes(2)
    await schedule.stop()
  })

  it('reports a failed step, runs the steps after it, and tries it again at the next interval', async () => {
    const report = vi.fn()
    const failing = vi.fn().mockRejectedValueOnce(new Error('database down')).mockResolvedValue(undefined)
    const after = vi.fn(async () => {})
    const schedule = pruneSchedule([failing, after], report)
    await vi.advanceTimersByTimeAsync(0)
    expect(report).toHaveBeenCalledWith(new Error('database down'))
    expect(after).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(realtimePruneIntervalMs)
    expect(failing).toHaveBeenCalledTimes(2)
    expect(report).toHaveBeenCalledTimes(1)
    await schedule.stop()
  })

  it('never runs two rounds at once', async () => {
    const { step, finish } = pending()
    const schedule = pruneSchedule([step], vi.fn())
    await vi.advanceTimersByTimeAsync(2 * realtimePruneIntervalMs)
    expect(step).toHaveBeenCalledTimes(1)
    finish()
    await vi.advanceTimersByTimeAsync(realtimePruneIntervalMs)
    expect(step).toHaveBeenCalledTimes(2)
    await schedule.stop()
  })

  it('runs nothing after it stops, and stop waits for the round in progress', async () => {
    const { step, finish } = pending()
    const schedule = pruneSchedule([step], vi.fn())
    let stopped = false
    const stopping = schedule.stop().then(() => {
      stopped = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(stopped).toBe(false)
    finish()
    await stopping
    await vi.advanceTimersByTimeAsync(6 * realtimePruneIntervalMs)
    expect(step).toHaveBeenCalledTimes(1)
  })
})
