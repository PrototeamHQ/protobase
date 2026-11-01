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

const setup = (options: { socketFirst?: boolean } = {}) => {
  const sockets: ReturnType<typeof fakeSocket>[] = []
  const messages: unknown[] = []
  const poll = vi.fn(() => Promise.resolve())
  const stop = pollThenSocket({
    poll,
    socket: () => {
      const socket = fakeSocket()
      sockets.push(socket)
      return socket
    },
    onMessage: (data) => messages.push(data),
    pollMs: 5_000,
    switchAfterMs: 30_000,
    ...options,
  })
  return { sockets, messages, poll, stop }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('pollThenSocket', () => {
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
    const stop = pollThenSocket({ poll, socket: () => (sockets.push(fakeSocket()), sockets.at(-1)!), onMessage: () => {}, socketFirst: true })
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
