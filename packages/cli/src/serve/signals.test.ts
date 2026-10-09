import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeOnSignals } from './signals'

const listeners = () => process.listenerCount('SIGTERM') + process.listenerCount('SIGINT')

describe('closeOnSignals', () => {
  const before = listeners()
  afterEach(() => expect(listeners()).toBe(before))

  it('closes once on the first signal, then exits with 0', async () => {
    const close = vi.fn(async () => {})
    const exit = vi.fn()
    closeOnSignals(close, exit)
    process.emit('SIGTERM')
    process.emit('SIGINT')
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0))
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('does not exit before the server is closed', async () => {
    let finish = () => {}
    const exit = vi.fn()
    closeOnSignals(() => new Promise<void>((resolve) => (finish = resolve)), exit)
    process.emit('SIGINT')
    await Promise.resolve()
    expect(exit).not.toHaveBeenCalled()
    finish()
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0))
  })
})
