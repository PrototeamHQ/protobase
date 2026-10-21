import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forbidden, unauthorized } from '../problem'
import { recheckWhileOpen } from './socket-recheck'

const start = (check: () => Promise<unknown>) => {
  const close = vi.fn()
  const report = vi.fn()
  const stop = recheckWhileOpen({ check, close, report, everyMs: 1000 })
  return { close, report, stop }
}

describe('recheckWhileOpen', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('checks every interval and keeps the socket open while the check resolves', async () => {
    const check = vi.fn(async () => {})
    const { close } = start(check)
    expect(check).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(3000)
    expect(check).toHaveBeenCalledTimes(3)
    expect(close).not.toHaveBeenCalled()
  })

  it('closes with 1008 and the problem’s title once the caller is refused, and checks no more', async () => {
    for (const refusal of [unauthorized('Signed out'), forbidden('caller-changed', 'Changed')]) {
      const check = vi.fn(async () => {
        throw refusal
      })
      const { close, report } = start(check)
      await vi.advanceTimersByTimeAsync(5000)
      expect(close.mock.calls).toEqual([[1008, refusal.title]])
      expect(check).toHaveBeenCalledTimes(1)
      expect(report).not.toHaveBeenCalled()
    }
  })

  it('reports any other error and closes with 1011, failing closed', async () => {
    const outage = new Error('store down')
    const { close, report } = start(async () => {
      throw outage
    })
    await vi.advanceTimersByTimeAsync(1000)
    expect(report).toHaveBeenCalledWith(outage)
    expect(close.mock.calls).toEqual([[1011, 'Internal Error']])
  })

  it('never starts a check while the last one runs', async () => {
    let running = 0
    let most = 0
    const check = vi.fn(async () => {
      most = Math.max(most, ++running)
      await new Promise((resolve) => setTimeout(resolve, 2500))
      running--
    })
    start(check)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(most).toBe(1)
    expect(check.mock.calls.length).toBeGreaterThan(1)
  })

  it('runs no check once stopped, nor closes when one in flight ends after the stop', async () => {
    let refuse!: (error: unknown) => void
    const check = vi.fn(() => new Promise((_resolve, reject) => (refuse = reject)))
    const { close, stop } = start(check)
    await vi.advanceTimersByTimeAsync(1000)
    stop()
    refuse(unauthorized('late'))
    await vi.advanceTimersByTimeAsync(5000)
    expect(check).toHaveBeenCalledTimes(1)
    expect(close).not.toHaveBeenCalled()

    const idle = start(check)
    idle.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(check).toHaveBeenCalledTimes(1)
  })
})
