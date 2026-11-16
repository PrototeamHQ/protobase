import { describe, expect, it } from 'vitest'
import { matchesAudience, onAudienceHost, parseAudiencePattern } from './audience-patterns'

const patterns = [parseAudiencePattern('https://*.example.app'), parseAudiencePattern('https://shop.example.com')]

describe('parseAudiencePattern', () => {
  it('takes an https origin, with one leading wildcard label at most', () => {
    expect(parseAudiencePattern('https://*.example.app')).toEqual({ wildcard: true, labels: ['example', 'app'] })
    expect(parseAudiencePattern('https://shop.example.com')).toEqual({ wildcard: false, labels: ['shop', 'example', 'com'] })
  })

  it('refuses anything else', () => {
    for (const text of [
      'http://*.example.app',
      'https://*.example.app/',
      'https://*.example.app/path',
      'https://*.example.app?x=1',
      'https://*.example.app:8443',
      'https://user@shop.example.com',
      'https://a.*.example.app',
      'https://*.*.example.app',
      'https://*example.app',
      'https://*.app',
      'https://localhost',
      'https://Shop.Example.com',
      '*.example.app',
    ]) {
      expect(() => parseAudiencePattern(text), text).toThrow(/auth.openIdProvider.audiences/)
    }
  })
})

describe('matchesAudience', () => {
  it('takes an origin a pattern stands for', () => {
    expect(matchesAudience(patterns, 'https://shop.example.app')).toBe(true)
    expect(matchesAudience(patterns, 'https://xn--bcher-kva.example.app')).toBe(true)
    expect(matchesAudience(patterns, 'https://shop.example.com')).toBe(true)
  })

  it('refuses another host, another scheme, an extra label, look-alike suffixes, and anything that is not the origin alone', () => {
    for (const audience of [
      'https://example.app',
      'https://a.b.example.app',
      'https://example.app.evil.com',
      'https://shop.example.app.evil.com',
      'https://evilexample.app',
      'https://shop.evilexample.app',
      'https://other.example.com',
      'http://shop.example.app',
      'https://shop.example.app/',
      'https://shop.example.app/path',
      'https://shop.example.app:443',
      'https://shop.example.app:8443',
      'https://user@shop.example.app',
      'https://evil.com#@shop.example.app',
      'https://evil.com?.example.app',
      'https://SHOP.example.app',
      'https://shop.example.app.',
      'shop.example.app',
      'not a url',
    ]) {
      expect(matchesAudience(patterns, audience), audience).toBe(false)
    }
  })
})

describe('onAudienceHost', () => {
  it('finds a URL on a pattern host, whatever its scheme, port or path', () => {
    expect(onAudienceHost(patterns, 'https://shop.example.app/api/auth/callback/oidc')).toBe(true)
    expect(onAudienceHost(patterns, 'http://shop.example.app:8080/x')).toBe(true)
    expect(onAudienceHost(patterns, 'https://shop.example.app')).toBe(true)
    expect(onAudienceHost(patterns, 'https://client.example.org/oauth/client.json')).toBe(false)
    expect(onAudienceHost(patterns, 'com.example.phone:/signed-in')).toBe(false)
    expect(onAudienceHost(patterns, undefined)).toBe(false)
  })
})
