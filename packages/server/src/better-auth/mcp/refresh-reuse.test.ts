import { describe, expect, it } from 'vitest'
import { fakeAdapter } from '../testing/fake-adapter'
import { endGrantIfFamilyInvalidated, findRefreshToken, presentedRefreshToken } from './refresh-reuse'

describe('the refresh token a request presents', () => {
  it('is the one refreshed at the token endpoint, or revoked at the revocation endpoint', () => {
    expect(presentedRefreshToken('/oauth2/token', { grant_type: 'refresh_token', refresh_token: 'r' })).toBe('r')
    expect(presentedRefreshToken('/oauth2/revoke', { token: 'r' })).toBe('r')
    expect(presentedRefreshToken('/oauth2/revoke', { token: 'r', token_type_hint: 'refresh_token' })).toBe('r')
  })

  it('is none for a code exchange, an access token revoked, another path or no body', () => {
    expect(presentedRefreshToken('/oauth2/token', { grant_type: 'authorization_code', code: 'c', refresh_token: 'r' })).toBeUndefined()
    expect(presentedRefreshToken('/oauth2/revoke', { token: 'a', token_type_hint: 'access_token' })).toBeUndefined()
    expect(presentedRefreshToken('/oauth2/introspect', { token: 'r' })).toBeUndefined()
    expect(presentedRefreshToken('/oauth2/token', undefined)).toBeUndefined()
  })
})

describe('a refresh token', () => {
  it('is found by its SHA-256 in unpadded base64url, as the provider stores it', async () => {
    const { adapter } = fakeAdapter({ oauthRefreshToken: [{ id: 'r1', userId: 'ana', clientId: 'assistant', token: 'ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0' }] })
    expect(await findRefreshToken(adapter, 'abc')).toMatchObject({ id: 'r1' })
    expect(await findRefreshToken(adapter, 'abd')).toBeUndefined()
  })
})

describe('a reused refresh token', () => {
  const rows = () => ({
    oauthConsent: [
      { id: 'c1', userId: 'ana', clientId: 'assistant' },
      { id: 'c2', userId: 'ana', clientId: 'editor' },
    ],
    oauthRefreshToken: [{ id: 'r2', userId: 'ana', clientId: 'editor' }],
  })
  const before = { id: 'r1', userId: 'ana', clientId: 'assistant' }

  it("ends the grant of its client once the provider deleted the token's family", async () => {
    const { tables, adapter } = fakeAdapter(rows())
    await endGrantIfFamilyInvalidated(adapter, before)
    expect(tables.oauthConsent).toEqual([{ id: 'c2', userId: 'ana', clientId: 'editor' }])
    expect(tables.oauthRefreshToken).toHaveLength(1)
  })

  it('leaves the grant while the token is still stored, rotated or not', async () => {
    const { tables, adapter } = fakeAdapter({ ...rows(), oauthRefreshToken: [{ ...before, revoked: new Date() }] })
    await endGrantIfFamilyInvalidated(adapter, before)
    expect(tables.oauthConsent).toHaveLength(2)
  })
})
