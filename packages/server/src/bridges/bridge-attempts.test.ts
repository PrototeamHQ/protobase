import { describe, expect, it, vi } from 'vitest'
import type { FunctionSocket } from '../functions/function-socket'
import { bridgeAttempts } from './bridge-attempts'
import { bridgeClosings } from './bridge-closings'

const fakeSocket = () => ({ send: async () => {}, close: vi.fn(), bufferedAmount: 0 }) satisfies FunctionSocket

describe('bridgeAttempts', () => {
  it('marks an attempt still being set up as withdrawn, and closes its socket once it opens', () => {
    const attempts = bridgeAttempts()
    const attempt = attempts.start('db')
    attempts.withdraw('db')
    expect(attempt.withdrawn()).toBe(true)
    const socket = fakeSocket()
    attempt.opened(socket)
    expect(socket.close).toHaveBeenCalledWith(bridgeClosings.withdrawn.code, bridgeClosings.withdrawn.reason)
  })

  it('closes the open sockets of the withdrawn target only', () => {
    const attempts = bridgeAttempts()
    const [db, other] = [attempts.start('db'), attempts.start('other')]
    const [dbSocket, otherSocket] = [fakeSocket(), fakeSocket()]
    db.opened(dbSocket)
    other.opened(otherSocket)
    attempts.withdraw('db')
    expect(dbSocket.close).toHaveBeenCalledOnce()
    expect(otherSocket.close).not.toHaveBeenCalled()
    expect(other.withdrawn()).toBe(false)
  })

  it('no longer reaches an attempt that ended', () => {
    const attempts = bridgeAttempts()
    const attempt = attempts.start('db')
    const socket = fakeSocket()
    attempt.opened(socket)
    attempt.end()
    attempt.end()
    attempts.withdraw('db')
    expect(attempt.withdrawn()).toBe(false)
    expect(socket.close).not.toHaveBeenCalled()
  })
})
