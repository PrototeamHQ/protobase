import { describe, expect, it } from 'vitest'
import { idTokenClaims } from './id-token-claims'

const user = { email: 'ana@example.com', emailVerified: true, name: 'Ana', image: 'https://example.com/ana.png' }

describe('idTokenClaims', () => {
  it('carries the address with the email scope, and the name and picture with the profile scope', () => {
    expect(idTokenClaims({ user, scopes: ['openid', 'email', 'profile'] })).toEqual({ email: 'ana@example.com', email_verified: true, name: 'Ana', picture: 'https://example.com/ana.png' })
    expect(idTokenClaims({ user, scopes: ['openid', 'email'] })).toEqual({ email: 'ana@example.com', email_verified: true })
    expect(idTokenClaims({ user, scopes: ['openid'] })).toEqual({})
  })

  it('says an unverified address is unverified, and leaves out a name or picture the person has none of', () => {
    expect(idTokenClaims({ user: { email: 'bo@example.com', emailVerified: false, name: '', image: null }, scopes: ['openid', 'email', 'profile'] })).toEqual({ email: 'bo@example.com', email_verified: false })
  })
})
