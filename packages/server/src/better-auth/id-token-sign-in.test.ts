import { describe, expect, it } from 'vitest'
import { postsIdToken, tokenSignInWith } from './id-token-sign-in'

describe('postsIdToken', () => {
  it('is a sign-in or a link with an ID token in the body', () => {
    expect(postsIdToken('/sign-in/social', { provider: 'github', idToken: { token: 'eyJ' } })).toBe(true)
    expect(postsIdToken('/link-social', { provider: 'google', idToken: { token: 'eyJ' } })).toBe(true)
  })

  it('is not the browser flow, or another path', () => {
    expect(postsIdToken('/sign-in/social', { provider: 'github', callbackURL: '/' })).toBe(false)
    expect(postsIdToken('/sign-in/social', undefined)).toBe(false)
    expect(postsIdToken('/sign-in/email', { idToken: { token: 'eyJ' } })).toBe(false)
    expect(postsIdToken(undefined, { idToken: { token: 'eyJ' } })).toBe(false)
  })
})

describe('tokenSignInWith', () => {
  const providers = [{ provider: 'oidc', clientId: 'app' }, { provider: 'central', clientId: 'https://app.example.com' }]

  it('is the provider a sign-in names, of those token sign-in is on for, never a link', () => {
    expect(tokenSignInWith('/sign-in/social', { provider: 'oidc' }, providers)).toBe(providers[0])
    expect(tokenSignInWith('/sign-in/social', { provider: 'central' }, providers)).toBe(providers[1])
    expect(tokenSignInWith('/sign-in/social', { provider: 'google' }, providers)).toBeUndefined()
    expect(tokenSignInWith('/link-social', { provider: 'oidc' }, providers)).toBeUndefined()
    expect(tokenSignInWith('/sign-in/social', { provider: 'oidc' }, [])).toBeUndefined()
  })
})
