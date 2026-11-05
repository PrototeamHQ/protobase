import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withDeadline } from './deadline.mjs'

const never = new Promise(() => {})

describe('withDeadline', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('gives the work its value when it settles in time, and leaves no timer behind', async () => {
    await expect(withDeadline(Promise.resolve('played'), 1000, 'timed out')).resolves.toBe('played')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('gives the timed-out value once the time passes on work that never settles', async () => {
    const outcome = withDeadline(never, 1000, 'timed out')
    await vi.advanceTimersByTimeAsync(1000)
    await expect(outcome).resolves.toBe('timed out')
  })

  it('rejects as the work does when it fails in time', async () => {
    await expect(withDeadline(Promise.reject(new Error('crashed')), 1000, 'timed out')).rejects.toThrow('crashed')
    expect(vi.getTimerCount()).toBe(0)
  })
})
