import { describe, expect, it } from 'vitest'
import { jsonOnlyOnMobile, mobileRequests } from './mobile-requests'

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

const posted = (origin: string | undefined, contentType?: string, method = 'POST') => {
  const headers = new Headers()
  if (origin) headers.set('origin', origin)
  if (contentType) headers.set('content-type', contentType)
  return new Request('https://shop.example.com/api/auth/sign-in/email', { method, headers, ...(method === 'POST' && { body: '{}' }) })
}

describe('jsonOnlyOnMobile', () => {
  it.each(['application/json', 'application/json; charset=utf-8', 'Application/Json'])('lets a Capacitor origin post %j', (type) => {
    expect(jsonOnlyOnMobile(posted('capacitor://localhost', type))).toBeUndefined()
    expect(jsonOnlyOnMobile(posted('https://localhost', type))).toBeUndefined()
  })

  it.each(['text/plain;charset=UTF-8', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'application/jsonx', 'application/json-patch+json', '', undefined])(
    'refuses a Capacitor origin posting %j',
    async (type) => {
      for (const origin of ['capacitor://localhost', 'https://localhost']) {
        const refused = jsonOnlyOnMobile(posted(origin, type))
        expect(refused?.status).toBe(415)
        expect(refused?.headers.get('content-type')).toBe('application/json')
        expect(await refused?.json()).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' })
      }
    },
  )

  it('leaves a GET from a Capacitor origin alone', () => {
    expect(jsonOnlyOnMobile(posted('capacitor://localhost', undefined, 'GET'))).toBeUndefined()
  })

  it.each(['https://shop.example.com', 'https://idp.example', 'null', undefined])('leaves a form POST from %j alone', (origin) => {
    expect(jsonOnlyOnMobile(posted(origin, 'application/x-www-form-urlencoded'))).toBeUndefined()
  })
})
