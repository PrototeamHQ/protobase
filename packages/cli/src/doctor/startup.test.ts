import { describe, expect, it } from 'vitest'
import { startupUrl } from './startup'

describe('startupUrl', () => {
  it("keeps the app's own URL", () => {
    expect(startupUrl({ url: 'https://app.example.com', auth: { passkeyDomain: 'example.com' } })).toBe('https://app.example.com')
  })

  it('stands in on the passkey domain, which must be the host of one of the origins', () => {
    expect(startupUrl({ auth: { passkeyDomain: 'admin.example.com' } })).toBe('https://admin.example.com')
  })

  it('stands in on localhost otherwise', () => {
    expect(startupUrl({ auth: {} })).toBe('http://localhost')
    expect(startupUrl({})).toBe('http://localhost')
  })
})
