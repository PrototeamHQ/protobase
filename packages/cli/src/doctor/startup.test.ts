import { describe, expect, it } from 'vitest'
import { startupUrl } from './startup'

describe('startupUrl', () => {
  it("keeps the app's own URL", () => {
    expect(startupUrl({ url: 'https://app.example.com', auth: { passkeyDomain: 'example.com' } }, {})).toBe('https://app.example.com')
  })

  it('stands in on the passkey domain, which must be the host of one of the origins, from the config or the environment', () => {
    expect(startupUrl({ auth: { passkeyDomain: 'admin.example.com' } }, {})).toBe('https://admin.example.com')
    expect(startupUrl({ auth: {} }, { PROTOBASE_PASSKEY_DOMAIN: 'admin.example.com' })).toBe('https://admin.example.com')
    expect(startupUrl({ auth: { passkeyDomain: 'admin.example.com' } }, { PROTOBASE_PASSKEY_DOMAIN: 'other.example.com' })).toBe('https://admin.example.com')
  })

  it("takes the scheme of the app's other origins, which must share the URL's", () => {
    expect(startupUrl({ auth: { origins: ['https://www.example.com'] } }, {})).toBe('https://localhost')
    expect(startupUrl({ auth: {} }, { PROTOBASE_ORIGINS: 'http://lan.example.com' })).toBe('http://localhost')
  })

  it('stands in on http://localhost otherwise', () => {
    expect(startupUrl({ auth: {} }, {})).toBe('http://localhost')
    expect(startupUrl({}, {})).toBe('http://localhost')
  })
})
