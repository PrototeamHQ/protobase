import { describe, expect, it } from 'vitest'
import { postsIdToken } from './id-token-sign-in'

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
