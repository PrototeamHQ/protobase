import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deadline } from './deadline.mjs'

describe('deadline', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('gives the value of a promise that settles in time', async () => {
    await expect(deadline(Promise.resolve(42), 1000)).resolves.toEqual({ done: true, value: 42 })
  })

  it('gives up on a promise that never settles once the time runs out', async () => {
    const waited = deadline(new Promise(() => {}), 1000)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(waited).resolves.toEqual({ done: false })
  })

  it('rejects with a rejection in time', async () => {
    await expect(deadline(Promise.reject(new Error('closed')), 1000)).rejects.toThrow('closed')
  })

  it('drops a rejection after the deadline instead of leaving it unhandled', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    let reject = (_error: Error) => {}
    const late = new Promise((_, rejectLate) => { reject = rejectLate })
    const waited = deadline(late, 1000)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(waited).resolves.toEqual({ done: false })
    reject(new Error('closed late'))
    await vi.advanceTimersByTimeAsync(0)
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })
})
