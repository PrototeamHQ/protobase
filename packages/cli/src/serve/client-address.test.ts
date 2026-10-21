import { describe, expect, it } from 'vitest'
import { clientAddress, readTrustedProxies } from './client-address'

describe('clientAddress', () => {
  it("is the socket's peer without trusted proxies, whatever the client forwards", () => {
    expect(clientAddress('198.51.100.4', '6.6.6.6', [])).toBe('198.51.100.4')
    expect(clientAddress('::ffff:198.51.100.4', null, [])).toBe('198.51.100.4')
  })

  it('is the peer when the peer is no trusted proxy', () => {
    expect(clientAddress('198.51.100.4', '6.6.6.6', ['10.0.0.0/8'])).toBe('198.51.100.4')
  })

  it('is the rightmost forwarded address that is no trusted proxy', () => {
    expect(clientAddress('10.0.0.2', '6.6.6.6, 203.0.113.7', ['10.0.0.0/8'])).toBe('203.0.113.7')
    expect(clientAddress('10.0.0.2', '6.6.6.6, 203.0.113.7, 10.0.0.9', ['10.0.0.0/8'])).toBe('203.0.113.7')
  })

  it('keeps the whole IPv6 address', () => {
    expect(clientAddress('::1', '2001:db8::5', ['::1'])).toBe('2001:0db8:0000:0000:0000:0000:0000:0005')
  })

  it('is the peer when the chain holds trusted proxies only, or an entry that is no address', () => {
    expect(clientAddress('10.0.0.2', '10.0.0.3', ['10.0.0.0/8'])).toBe('10.0.0.2')
    expect(clientAddress('10.0.0.2', 'unknown', ['10.0.0.0/8'])).toBe('10.0.0.2')
    expect(clientAddress('10.0.0.2', null, ['10.0.0.0/8'])).toBe('10.0.0.2')
  })
})

describe('readTrustedProxies', () => {
  it('reads addresses and CIDR ranges, comma separated', () => {
    expect(readTrustedProxies(undefined)).toEqual([])
    expect(readTrustedProxies(' 172.16.0.0/12 ,fd00::/8,')).toEqual(['172.16.0.0/12', 'fd00::/8'])
  })

  it('refuses an entry that is neither', () => {
    expect(() => readTrustedProxies('10.0.0.0/33')).toThrow('not "10.0.0.0/33"')
  })
})
