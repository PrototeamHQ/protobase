import { describe, expect, it } from 'vitest'
import { mobileRequests } from './mobile-requests'

const request = (...origins: string[]) => {
  const headers = new Headers()
  for (const origin of origins) headers.append('origin', origin)
  return new Request('https://shop.example.com/api/auth/sign-out', { method: 'POST', headers })
}

describe('mobileRequests', () => {
  it('trusts the Capacitor origin a granted request names', () => {
    const mobile = mobileRequests()
    expect(mobile.trusted(mobile.grant(request('capacitor://localhost')))).toEqual(['capacitor://localhost'])
    expect(mobile.trusted(mobile.grant(request('https://localhost')))).toEqual(['https://localhost'])
  })

  it('trusts nothing for a request it did not grant, even with the same origin as a granted one', () => {
    const mobile = mobileRequests()
    mobile.grant(request('capacitor://localhost'))
    expect(mobile.trusted(request('capacitor://localhost'))).toEqual([])
  })

  it('trusts nothing for a request another instance granted', () => {
    const granted = mobileRequests().grant(request('https://localhost'))
    expect(mobileRequests().trusted(granted)).toEqual([])
  })

  it.each([
    'https://evil.example',
    'https://localhost:8443',
    'http://localhost',
    'https://localhost/',
    'HTTPS://LOCALHOST',
    'https://localhost.evil.com',
    'capacitor://localhost:1',
    'null',
    '',
  ])('trusts nothing for a granted request from %j', (origin) => {
    const mobile = mobileRequests()
    expect(mobile.trusted(mobile.grant(request(origin)))).toEqual([])
  })

  it('trusts nothing for a granted request without an Origin', () => {
    const mobile = mobileRequests()
    expect(mobile.trusted(mobile.grant(request()))).toEqual([])
  })

  it('trusts nothing for a granted request with two Origin headers', () => {
    const mobile = mobileRequests()
    expect(mobile.trusted(mobile.grant(request('https://evil.example', 'https://localhost')))).toEqual([])
  })

  it('trusts nothing without a request, as when Better Auth builds its context', () => {
    expect(mobileRequests().trusted()).toEqual([])
  })
})
