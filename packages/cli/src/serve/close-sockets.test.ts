import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeSockets, type ClosableSocket } from './close-sockets'

// A client that leaves the set `closesAfterMs` after it is asked to close, or never.
const client = (clients: Set<ClosableSocket>, closesAfterMs?: number) => {
  const socket = {
    close: vi.fn(() => {
      if (closesAfterMs !== undefined) setTimeout(() => clients.delete(socket), closesAfterMs)
    }),
    terminate: vi.fn(() => clients.delete(socket)),
  }
  clients.add(socket)
  return socket
}

describe('closeSockets', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('closes every socket with 1001 and resolves as soon as they are gone', async () => {
    const clients = new Set<ClosableSocket>()
    const sockets = [client(clients, 10), client(clients, 120)]
    let done = false
    const closing = closeSockets(clients).then(() => (done = true))
    await vi.advanceTimersByTimeAsync(200)
    await closing
    expect(done).toBe(true)
    for (const socket of sockets) {
      expect(socket.close).toHaveBeenCalledWith(1001, 'Server shutting down')
      expect(socket.terminate).not.toHaveBeenCalled()
    }
  })

  it('drops whatever is still open at the deadline, a socket opened meanwhile included', async () => {
    const clients = new Set<ClosableSocket>()
    const stuck = client(clients)
    const closing = closeSockets(clients, { graceMs: 1000 })
    await vi.advanceTimersByTimeAsync(500)
    const late = client(clients)
    await vi.advanceTimersByTimeAsync(600)
    await closing
    expect(stuck.terminate).toHaveBeenCalled()
    expect(late.terminate).toHaveBeenCalled()
    expect(clients.size).toBe(0)
  })

  it('resolves at once without sockets', async () => {
    await closeSockets(new Set())
  })
})
