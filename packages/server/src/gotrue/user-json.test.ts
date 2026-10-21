import { describe, expect, it } from 'vitest'
import { accessClaims } from './session-json'
import { goTrueUser, type StoredAccount } from './user-json'

const user = { id: 'u1', email: 'ann@example.com', createdAt: new Date('2026-07-01T00:00:00Z'), updatedAt: new Date('2026-07-02T00:00:00Z') }
const account = (providerId: string, createdAt: string): StoredAccount => ({ id: `a-${providerId}`, providerId, accountId: providerId === 'credential' ? 'u1' : '9', userId: 'u1', createdAt, updatedAt: createdAt })
const accounts = [account('github', '2026-07-03T00:00:00Z'), account('credential', '2026-07-01T00:00:00Z')]

describe("a Better Auth user as GoTrue's", () => {
  it('names its providers, the first it signed in with first, a password as `email`', () => {
    const json = goTrueUser(user, accounts)
    expect(json.app_metadata).toEqual({ provider: 'email', providers: ['email', 'github'] })
    expect(json.identities.map((identity) => [identity.provider, identity.id])).toEqual([['email', 'u1'], ['github', '9']])
    expect(json).toMatchObject({ id: 'u1', aud: 'authenticated', role: 'authenticated', created_at: '2026-07-01T00:00:00.000Z', is_anonymous: false })
  })

  it('has the confirmation time and metadata the store holds, and leaves out what it does not', () => {
    expect(goTrueUser(user, [])).not.toHaveProperty('email_confirmed_at')
    expect(goTrueUser(user, []).user_metadata).toEqual({})
    const stored = goTrueUser({ ...user, emailConfirmedAt: '2026-07-01T10:00:00Z', metadata: '{"full_name":"Ann"}' }, [])
    expect(stored).toMatchObject({ email_confirmed_at: '2026-07-01T10:00:00.000Z', confirmed_at: '2026-07-01T10:00:00.000Z', user_metadata: { full_name: 'Ann' } })
  })
})

describe('the claims of an access token', () => {
  it("are Supabase's, with the database role `authenticated`, for an hour", () => {
    const claims = accessClaims({ user: { ...user, metadata: { plan: 'pro' } }, accounts, sessionId: 's1', issuer: 'https://app.example.com/api/sb/auth/v1', now: 1_000 })
    expect(claims).toEqual({
      iss: 'https://app.example.com/api/sb/auth/v1',
      sub: 'u1',
      aud: 'authenticated',
      iat: 1_000,
      exp: 4_600,
      email: 'ann@example.com',
      app_metadata: { provider: 'email', providers: ['email', 'github'] },
      user_metadata: { plan: 'pro' },
      role: 'authenticated',
      aal: 'aal1',
      session_id: 's1',
      is_anonymous: false,
    })
  })
})
