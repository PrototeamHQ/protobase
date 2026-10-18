import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleDroppedConnections } from './dropped-connections'

describe('handleDroppedConnections', () => {
  afterEach(() => vi.restoreAllMocks())

  it('prints a dropped checked-out or idle client once, without throwing', () => {
    const print = vi.spyOn(console, 'error').mockImplementation(() => {})
    const pool = handleDroppedConnections(new EventEmitter())
    const client = new EventEmitter()
    pool.emit('connect', client)
    expect(() => client.emit('error', new Error('Connection terminated unexpectedly'))).not.toThrow()
    expect(print).toHaveBeenCalledTimes(1)
    expect(print.mock.calls[0]?.[0]).toContain('Connection terminated unexpectedly')
  })

  it('does not throw or print again for the pool error of an idle client', () => {
    const print = vi.spyOn(console, 'error').mockImplementation(() => {})
    const pool = handleDroppedConnections(new EventEmitter())
    expect(() => pool.emit('error', new Error('Connection terminated unexpectedly'))).not.toThrow()
    expect(print).not.toHaveBeenCalled()
  })

  it('returns the same pool', () => {
    const pool = new EventEmitter()
    expect(handleDroppedConnections(pool)).toBe(pool)
  })
})
