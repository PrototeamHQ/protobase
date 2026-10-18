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
