import { describe, expect, it } from 'vitest'
import { requestLocale } from './request-locale'

const request = (acceptLanguage?: string) => new Request('https://app.test/mcp', { headers: acceptLanguage ? { 'accept-language': acceptLanguage } : {} })

describe('requestLocale', () => {
  it('is the app\'s locale when it sets one, whatever the request accepts', () => {
    expect(requestLocale('nl', request('en-GB'))).toBe('nl')
  })
  it('is the most preferred language the screens come in', () => {
    expect(requestLocale(undefined, request('nl-BE, en;q=0.8'))).toBe('nl')
    expect(requestLocale(undefined, request('en;q=0.5, nl;q=0.9'))).toBe('nl')
    expect(requestLocale(undefined, request('fr, nl;q=0'))).toBe('en')
  })
  it('is English without a header', () => {
    expect(requestLocale(undefined, request())).toBe('en')
  })
})
