import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isPingable, keepAlive } from './socket-keepalive'

const socket = () => {
  let pong = () => {}
  const raw = { ping: vi.fn(), terminate: vi.fn(), on: vi.fn((_event: 'pong', listener: () => void) => (pong = listener)) }
  return { raw, pong: () => pong() }
}

describe('keepAlive', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('keeps pinging a socket that answers', () => {
    const { raw, pong } = socket()
    keepAlive(raw, 1000)
    for (let round = 0; round < 3; round += 1) {
      vi.advanceTimersByTime(1000)
      pong()
    }
    expect(raw.ping).toHaveBeenCalledTimes(3)
    expect(raw.terminate).not.toHaveBeenCalled()
  })

  it('ends a socket that did not answer its last ping', () => {
    const { raw } = socket()
    keepAlive(raw, 1000)
    vi.advanceTimersByTime(1000)
    expect(raw.terminate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(raw.terminate).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)
    expect(raw.ping).toHaveBeenCalledTimes(1)
  })

  it('pings no more once stopped', () => {
    const { raw } = socket()
    keepAlive(raw, 1000)()
    vi.advanceTimersByTime(5000)
    expect(raw.ping).not.toHaveBeenCalled()
  })

  it('takes only a socket that can be pinged', () => {
    expect(isPingable(socket().raw)).toBe(true)
    expect(isPingable({ send: () => {}, close: () => {} })).toBe(false)
  })
})
