import { describe, expect, it } from 'vitest'
import { capSocketMessages, honorSocketMessageCaps, honorsSocketMessageCaps, socketMessageCapOf } from './socket-message-cap'

describe('socket message caps', () => {
  it('gives the cap a request was marked with, and none for an unmarked one', () => {
    const request = {}
    expect(socketMessageCapOf(request)).toBeUndefined()
    capSocketMessages(request, 1024)
    expect(socketMessageCapOf(request)).toBe(1024)
  })

  it('never raises an earlier mark on the same request', () => {
    const request = {}
    capSocketMessages(request, 1024)
    capSocketMessages(request, 65536)
    expect(socketMessageCapOf(request)).toBe(1024)
    capSocketMessages(request, 512)
    expect(socketMessageCapOf(request)).toBe(512)
  })

  it('reads and writes under the registered symbol, as another copy of this module does', () => {
    const key = Symbol.for('protobase.socketMessageCap')
    const byHand: Record<symbol, unknown> = { [key]: 1024 }
    expect(socketMessageCapOf(byHand)).toBe(1024)
    const written: Record<symbol, unknown> = {}
    capSocketMessages(written, 2048)
    expect(written[key]).toBe(2048)
  })

  it.each([0, -1, 1.5, NaN, Infinity, 2 ** 53])('refuses to mark %s', (bytes) => {
    expect(() => capSocketMessages({}, bytes)).toThrow(TypeError)
  })

  it.each([0, -5, 0.5, NaN, Infinity, '1024', null, 1024n])('reads a stored %s as no cap', (bytes) => {
    expect(socketMessageCapOf({ [Symbol.for('protobase.socketMessageCap')]: bytes })).toBeUndefined()
  })

  it('knows a ws server that applies the caps', () => {
    const server = {}
    expect(honorsSocketMessageCaps(server)).toBe(false)
    expect(honorsSocketMessageCaps(undefined)).toBe(false)
    honorSocketMessageCaps(server)
    expect(honorsSocketMessageCaps(server)).toBe(true)
  })
})
