import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pollThenSocket, type LiveSocket } from './poll-then-socket'

const fakeSocket = () => {
  const socket: LiveSocket & { closed: boolean } = {
    closed: false,
    onopen: null,
    onmessage: null,
    onclose: null,
    close: () => {
      socket.closed = true
    },
  }
  return socket
}

const setup = (options: { socketFirst?: boolean; poll?: () => Promise<void> } = {}) => {
  const sockets: ReturnType<typeof fakeSocket>[] = []
  const messages: unknown[] = []
  const errors: unknown[] = []
  const poll = vi.fn(options.poll ?? (() => Promise.resolve()))
  const stop = pollThenSocket({
    poll,
    onError: (error) => errors.push(error),
    socket: () => {
      const socket = fakeSocket()
      sockets.push(socket)
      return socket
    },
    onMessage: (data) => messages.push(data),
    pollMs: 5_000,
    switchAfterMs: 30_000,
    socketFirst: options.socketFirst,
  })
  return { sockets, messages, errors, poll, stop }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('pollThenSocket', () => {
  it('hands a read that rejects to onError and still reads again', async () => {
    const failure = new Error('offline')
    const { errors, poll, stop } = setup({ poll: () => Promise.reject(failure) })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(poll).toHaveBeenCalledTimes(3)
    expect(errors).toEqual([failure, failure, failure])
    stop()
  })

  it('polls first and opens the socket after the switch time, which then takes over', async () => {
    const { sockets, messages, poll, stop } = setup()
    await vi.advanceTimersByTimeAsync(29_999)
    expect(poll).toHaveBeenCalledTimes(6)
    expect(sockets).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(sockets).toHaveLength(1)
    expect(poll).toHaveBeenCalledTimes(7)
    // Polling goes on while the socket connects.
    await vi.advanceTimersByTimeAsync(5_000)
    expect(poll).toHaveBeenCalledTimes(8)
    sockets[0]!.onopen!({})
    await vi.advanceTimersByTimeAsync(0)
    expect(poll).toHaveBeenCalledTimes(9)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(poll).toHaveBeenCalledTimes(9)
    sockets[0]!.onmessage!({ data: 'changed' })
    expect(messages).toEqual(['changed'])
    stop()
    expect(sockets[0]!.closed).toBe(true)
  })

  it('polls again at once when the socket drops, and tries it again after the switch time', async () => {
    const { sockets, poll, stop } = setup()
    await vi.advanceTimersByTimeAsync(30_000)
    sockets[0]!.onopen!({})
    await vi.advanceTimersByTimeAsync(0)
    const before = poll.mock.calls.length
    sockets[0]!.onclose!({})
    await vi.advanceTimersByTimeAsync(0)
    expect(poll).toHaveBeenCalledTimes(before + 1)
    await vi.advanceTimersByTimeAsync(29_999)
    expect(poll).toHaveBeenCalledTimes(before + 6)
    expect(sockets).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(sockets).toHaveLength(2)
    stop()
  })

  it('treats a socket that fails to open as one that dropped', async () => {
    const { sockets, poll, stop } = setup({ socketFirst: true })
    sockets[0]!.onclose!({})
    await vi.advanceTimersByTimeAsync(0)
    expect(poll).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(sockets).toHaveLength(2)
    stop()
  })

  it('opens the socket at once with socketFirst, and reads once as it opens', async () => {
    const { sockets, poll, stop } = setup({ socketFirst: true })
    expect(sockets).toHaveLength(1)
    expect(poll).not.toHaveBeenCalled()
    sockets[0]!.onopen!({})
    await vi.advanceTimersByTimeAsync(60_000)
    expect(poll).toHaveBeenCalledTimes(1)
    stop()
  })

  it('reads one at a time, and once more when a read is asked for during one', async () => {
    let finish = () => {}
    const poll = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    const sockets: LiveSocket[] = []
    const stop = pollThenSocket({ poll, onError: () => {}, socket: () => (sockets.push(fakeSocket()), sockets.at(-1)!), onMessage: () => {}, socketFirst: true })
    sockets[0]!.onclose!({})
    sockets.length = 0
    await vi.advanceTimersByTimeAsync(30_000)
    sockets[0]!.onopen!({})
    expect(poll).toHaveBeenCalledTimes(1)
    finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(poll).toHaveBeenCalledTimes(2)
    finish()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(poll).toHaveBeenCalledTimes(2)
    stop()
  })

  it('does nothing more once stopped, whatever its socket does', async () => {
    const { sockets, poll, stop } = setup()
    await vi.advanceTimersByTimeAsync(30_000)
    stop()
    const calls = poll.mock.calls.length
    sockets[0]!.onclose!({})
    await vi.advanceTimersByTimeAsync(120_000)
    expect(poll).toHaveBeenCalledTimes(calls)
    expect(sockets).toHaveLength(1)
  })
})
