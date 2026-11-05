import { describe, expect, it } from 'vitest'
import { clientAddress, createRateLimit } from './rate-limit'

describe('createRateLimit', () => {
  it('allows perMinute takes per key a minute, then says how long to wait', () => {
    let at = 1_000_000
    const limit = createRateLimit({ now: () => at })
    for (let i = 0; i < 5; i++) expect(limit.take('contact|1.2.3.4', 5)).toBe(0)
    at += 20_000
    expect(limit.take('contact|1.2.3.4', 5)).toBe(40)
    expect(limit.take('contact|5.6.7.8', 5)).toBe(0)
    expect(limit.take('quote|1.2.3.4', 5)).toBe(0)
    at += 40_000
    expect(limit.take('contact|1.2.3.4', 5)).toBe(0)
  })

  it('tells whether a key spent its takes without taking one', () => {
    let at = 1_000_000
    const limit = createRateLimit({ now: () => at })
    expect(limit.spent('1.2.3.4', 2)).toBe(0)
    limit.take('1.2.3.4', 2)
    expect(limit.spent('1.2.3.4', 2)).toBe(0)
    limit.take('1.2.3.4', 2)
    at += 15_000
    expect(limit.spent('1.2.3.4', 2)).toBe(45)
    at += 45_000
    expect(limit.spent('1.2.3.4', 2)).toBe(0)
  })

  it('keeps at most maxKeys, forgetting the oldest window first', () => {
    let at = 1_000_000
    const limit = createRateLimit({ now: () => at, maxKeys: 2 })
    limit.take('a', 1)
    at += 1
    limit.take('b', 1)
    at += 1
    limit.take('c', 1)
    // `a` was forgotten, so it may take again; `b` and `c` are still counted.
    expect(limit.spent('a', 1)).toBe(0)
    expect(limit.spent('b', 1)).toBeGreaterThan(0)
    expect(limit.spent('c', 1)).toBeGreaterThan(0)
  })

  it('drops the windows that ended before a new key, keeping those that still run', () => {
    let at = 1_000_000
    const limit = createRateLimit({ now: () => at, maxKeys: 2 })
    limit.take('a', 1)
    at += 30_000
    limit.take('b', 1)
    at += 30_000
    // `a`'s window ended, so `c` takes its place and `b` is still counted.
    limit.take('c', 1)
    expect(limit.spent('b', 1)).toBeGreaterThan(0)
    expect(limit.spent('c', 1)).toBeGreaterThan(0)
  })
})

describe('clientAddress', () => {
  const of = (forwardedFor?: string) => clientAddress(new Headers(forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor }))

  it('reads the address as the sign-in limit does', () => {
    expect(of('203.0.113.7')).toBe('203.0.113.7')
    expect(of(' 203.0.113.7 ')).toBe('203.0.113.7')
    expect(of('::ffff:203.0.113.7')).toBe('203.0.113.7')
    expect(of('2001:db8:1:2:3:4:5:6')).toBe(of('2001:db8:1:2:ffff::1'))
  })

  it('counts a header it cannot trust as no address: unknown, or localhost while testing', () => {
    expect(of('203.0.113.7, 198.51.100.1')).toBe('127.0.0.1')
    expect(of('not an address')).toBe('127.0.0.1')
    expect(of()).toBe('127.0.0.1')
  })
})
