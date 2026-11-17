import { describe, expect, it } from 'vitest'
import { addsAuthorizationParams } from './platform-authorization-params'

describe('addsAuthorizationParams', () => {
  const providers = ['github', 'central']

  it("is a sign-in or a link with one of the providers that brings parameters of the client's own", () => {
    expect(addsAuthorizationParams('/sign-in/social', { provider: 'github', additionalParams: { connection: 'other' } }, providers)).toBe(true)
    expect(addsAuthorizationParams('/link-social', { provider: 'central', additionalParams: { prompt: 'none' } }, providers)).toBe(true)
  })

  it('is not one without parameters, with another provider, or another path', () => {
    expect(addsAuthorizationParams('/sign-in/social', { provider: 'github' }, providers)).toBe(false)
    expect(addsAuthorizationParams('/sign-in/social', { provider: 'github', additionalParams: {} }, providers)).toBe(false)
    expect(addsAuthorizationParams('/sign-in/social', { provider: 'google', additionalParams: { access_type: 'offline' } }, providers)).toBe(false)
    expect(addsAuthorizationParams('/sign-in/email', { provider: 'github', additionalParams: { connection: 'other' } }, providers)).toBe(false)
    expect(addsAuthorizationParams(undefined, undefined, providers)).toBe(false)
  })
})
