import { describe, expect, it } from 'vitest'
import { apiUrl, checkReleaseUrl, forwardedPort, httpAllowances } from './api-origin'

describe('apiUrl', () => {
  it('takes --api over the auth issuer, and needs one of them', () => {
    expect(apiUrl('https://api.example.com', 'https://shop.example.com', 'ios').origin).toBe('https://api.example.com')
    expect(apiUrl(undefined, 'https://shop.example.com/', 'android').origin).toBe('https://shop.example.com')
    expect(() => apiUrl(undefined, undefined, 'ios')).toThrow('pass --api https://')
  })

  it('takes https anywhere, and plain http only on this machine or the Android emulator\'s host', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) expect(apiUrl(`http://${host}:3000`, undefined, 'ios').hostname).toBe(host)
    for (const host of ['localhost', '127.0.0.1', '10.0.2.2']) expect(apiUrl(`http://${host}:3000`, undefined, 'android').hostname).toBe(host)
    for (const [api, platform] of [['http://192.168.1.10:3000', 'android'], ['http://example.com', 'ios'], ['http://10.0.2.2:3000', 'ios'], ['http://[::1]:3000', 'android']] as const) {
      expect(() => apiUrl(api, undefined, platform), api).toThrow('plain http is only for a server on this machine')
    }
  })

  it('refuses what is not an http or https origin', () => {
    expect(() => apiUrl('capacitor://x', undefined, 'ios')).toThrow('must be an http or https URL')
    expect(() => apiUrl('shop.example.com', undefined, 'ios')).toThrow('is not a URL')
    for (const api of ['https://api.example.com/v1', 'https://u:p@api.example.com', 'https://api.example.com/?x=1', 'https://api.example.com/#f', 'https://api.example.com?']) {
      expect(() => apiUrl(api, undefined, 'ios'), api).toThrow('without a user, path, query or fragment')
    }
  })
})

describe('httpAllowances', () => {
  it('allows plain http for an http API, and mixed content only for the emulator\'s host', () => {
    expect(httpAllowances(new URL('https://api.example.com'))).toEqual({ cleartext: false, mixedContent: false })
    expect(httpAllowances(new URL('http://localhost:3000'))).toEqual({ cleartext: true, mixedContent: false })
    expect(httpAllowances(new URL('http://10.0.2.2:3000'))).toEqual({ cleartext: true, mixedContent: true })
  })
})

describe('forwardedPort', () => {
  it('forwards a server on this machine to an Android device', () => {
    expect(forwardedPort(new URL('http://localhost:3000'), 'android')).toBe(3000)
    expect(forwardedPort(new URL('http://127.0.0.1'), 'android')).toBe(80)
    expect(forwardedPort(new URL('http://localhost:3000'), 'ios')).toBeUndefined()
    expect(forwardedPort(new URL('http://10.0.2.2:3000'), 'android')).toBeUndefined()
  })
})

describe('checkReleaseUrl', () => {
  it('takes https to a server that is not this machine', () => {
    expect(() => checkReleaseUrl(new URL('https://api.example.com'))).not.toThrow()
    expect(() => checkReleaseUrl(new URL('https://192.168.1.10:8443'))).not.toThrow()
  })

  it('refuses plain http, and https to this machine or the emulator\'s host', () => {
    for (const url of ['http://localhost:3000', 'http://10.0.2.2:3000', 'https://localhost:3000', 'https://app.localhost', 'https://127.0.0.2', 'https://[::1]', 'https://10.0.2.2', 'https://0.0.0.0']) {
      expect(() => checkReleaseUrl(new URL(url)), url).toThrow('A release build calls its server over https')
    }
  })
})
