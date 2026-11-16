import { describe, expect, it } from 'vitest'
import { resolveSignUpDomains, signUpTakes } from './sign-up-domains'

describe('resolveSignUpDomains', () => {
  it('takes every address when neither the app nor the platform names domains', () => {
    expect(resolveSignUpDomains(undefined, {})).toBeUndefined()
  })

  it("trims and lowercases the app's domains", () => {
    expect(resolveSignUpDomains([' Example.COM '], {})).toEqual(['example.com'])
  })

  it("takes the platform's list in place of the app's, an empty one too", () => {
    expect(resolveSignUpDomains(['example.com'], { PROTOBASE_SIGN_UP_DOMAINS: 'acme.test, Other.test' })).toEqual(['acme.test', 'other.test'])
    expect(resolveSignUpDomains(['example.com'], { PROTOBASE_SIGN_UP_DOMAINS: '' })).toEqual([])
    expect(resolveSignUpDomains(undefined, { PROTOBASE_SIGN_UP_DOMAINS: 'acme.test' })).toEqual(['acme.test'])
  })

  it('refuses a domain that is not a host name', () => {
    expect(() => resolveSignUpDomains(['@example.com'], {})).toThrow('signUp.domains must be host names such as example.com, not "@example.com"')
    expect(() => resolveSignUpDomains(undefined, { PROTOBASE_SIGN_UP_DOMAINS: 'https://example.com' })).toThrow('not "https://example.com"')
  })
})

describe('signUpTakes', () => {
  it('takes every address without a list', () => {
    expect(signUpTakes('ann@anywhere.test', undefined)).toBe(true)
  })

  it('takes an address at a listed domain or a subdomain of one, whatever its case', () => {
    expect(signUpTakes('ann@example.com', ['example.com'])).toBe(true)
    expect(signUpTakes('ann@EXAMPLE.com', ['example.com'])).toBe(true)
    expect(signUpTakes('ann@mail.example.com', ['example.com'])).toBe(true)
  })

  it('refuses any other address, and every address with an empty list', () => {
    expect(signUpTakes('ann@notexample.com', ['example.com'])).toBe(false)
    expect(signUpTakes('ann@example.com.evil.test', ['example.com'])).toBe(false)
    expect(signUpTakes('ann@example.com', [])).toBe(false)
  })
})
