import { describe, expect, it } from 'vitest'
import { providerName, readProviderError, readSignInLink, withoutSignInLink } from './provider-link'

describe('readSignInLink', () => {
  it('reads the provider a link asks to sign in with', () => {
    expect(readSignInLink('https://erp.example.com/?sign-in=github')).toBe('github')
    expect(readSignInLink('https://erp.example.com/orders?view=open&sign-in=oidc')).toBe('oidc')
  })

  it('starts nothing without the marker, with an empty one, or once the provider came back with an error', () => {
    expect(readSignInLink('https://erp.example.com/')).toBeUndefined()
    expect(readSignInLink('https://erp.example.com/?sign-in')).toBeUndefined()
    expect(readSignInLink('https://erp.example.com/?sign-in=github&error=signup_disabled')).toBeUndefined()
  })
})

describe('readProviderError', () => {
  it("reads the provider's error code", () => {
    expect(readProviderError('https://erp.example.com/?error=signup_disabled')).toBe('signup_disabled')
    expect(readProviderError('https://erp.example.com/')).toBeUndefined()
  })
})

describe('withoutSignInLink', () => {
  it('drops the marker and the error and keeps the rest of the address', () => {
    expect(withoutSignInLink('https://erp.example.com/orders?view=open&sign-in=github#top')).toBe('/orders?view=open#top')
    expect(withoutSignInLink('https://erp.example.com/-/account?error=account_already_linked_to_different_user')).toBe('/-/account')
  })
})

describe('providerName', () => {
  it("names the platform's provider by its own name, and well-known providers by theirs", () => {
    expect(providerName('github')).toBe('GitHub')
    expect(providerName('oidc', { provider: 'oidc', name: 'Acme SSO' })).toBe('Acme SSO')
    expect(providerName('github', { provider: 'github', name: 'GitHub' })).toBe('GitHub')
    expect(providerName('keycloak')).toBe('Keycloak')
  })
})
