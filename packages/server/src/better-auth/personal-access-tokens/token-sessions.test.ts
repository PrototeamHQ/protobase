import { describe, expect, it, vi } from 'vitest'
import type { AuthContext } from '../organizations/store'
import { newToken, tokenHash } from './token-format'
import { personalAccessTokenOf, personalAccessTokenSessions } from './token-sessions'
import type { PersonalAccessTokenRow } from './token-store'

const prefix = 'invoices_'
const now = new Date('2026-08-01T00:00:00Z')

// The store a token is looked up in: one token row and one user, each by the field the lookup names.
const storeWith = (row: PersonalAccessTokenRow | undefined, user: Record<string, unknown> | null = { id: 'u1', role: 'sales' }) => {
  const findOne = vi.fn(async ({ model, where }: { model: string; where: { field: string; value: unknown }[] }) => {
    if (model === 'personalAccessToken') return row && where[0]!.value === row.tokenHash ? row : null
    if (model === 'user') return user !== null && where[0]!.value === user.id ? user : null
    throw new Error(`unexpected lookup of ${model}`)
  })
  const update = vi.fn(async () => null)
  const context = { adapter: { findOne, update } } as unknown as AuthContext
  return { findOne, update, context }
}

const rowFor = async (token: string, row: Partial<PersonalAccessTokenRow> = {}): Promise<PersonalAccessTokenRow> => ({
  id: 't1',
  userId: 'u1',
  name: 'Weekly invoices',
  tokenHash: await tokenHash(token),
  role: 'sales',
  createdAt: new Date('2026-07-01T00:00:00Z'),
  ...row,
})

const sessionsOf = (context: AuthContext, tenant?: number) => personalAccessTokenSessions({ prefix, context: async () => context, organizations: false, ...(tenant !== undefined && { tenant }) })

describe("a personal access token's session", () => {
  it('is its user with the role it was made with, in the app\'s one tenant, and notes the use', async () => {
    const token = newToken(prefix)
    const store = storeWith(await rowFor(token))
    expect(await sessionsOf(store.context, 1)(token, now)).toEqual({ session: { user: { id: 'u1', roles: ['sales'] }, tenant: 1 }, id: 't1', expiresAt: Number.POSITIVE_INFINITY })
    expect(store.update).toHaveBeenCalledWith({ model: 'personalAccessToken', where: [{ field: 'id', value: 't1' }], update: { lastUsedAt: now } })
  })

  it('notes a use at most once a minute', async () => {
    const token = newToken(prefix)
    const store = storeWith(await rowFor(token, { lastUsedAt: new Date(now.getTime() - 30_000) }))
    await sessionsOf(store.context)(token, now)
    expect(store.update).not.toHaveBeenCalled()
  })

  it('is refused without a lookup when the checksum does not match', async () => {
    const token = newToken(prefix)
    const store = storeWith(await rowFor(token))
    const changed = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`
    await expect(sessionsOf(store.context)(changed, now)).rejects.toMatchObject({ status: 401 })
    expect(store.findOne).not.toHaveBeenCalled()
  })

  it('is refused when the store has no such token, as after a revoke', async () => {
    const store = storeWith(undefined)
    await expect(sessionsOf(store.context)(newToken(prefix), now)).rejects.toMatchObject({ status: 401 })
    expect(store.findOne).toHaveBeenCalledTimes(1)
  })

  it('is refused once it expired, and answers its expiry until then', async () => {
    const token = newToken(prefix)
    const expired = storeWith(await rowFor(token, { expiresAt: now }))
    await expect(sessionsOf(expired.context)(token, now)).rejects.toMatchObject({ status: 401 })
    const later = new Date(now.getTime() + 1000)
    const valid = storeWith(await rowFor(token, { expiresAt: later }))
    expect((await sessionsOf(valid.context)(token, now)).expiresAt).toBe(later.getTime() / 1000)
  })

  it('is refused for a banned or deleted user, or one who no longer holds its role', async () => {
    const token = newToken(prefix)
    const row = await rowFor(token)
    for (const user of [{ id: 'u1', role: 'sales', banned: true }, null, { id: 'u1', role: 'accountant' }]) {
      await expect(sessionsOf(storeWith(row, user).context)(token, now)).rejects.toMatchObject({ status: 401 })
    }
  })
})

describe("a request's personal access token", () => {
  const request = (authorization?: string) => new Request('http://localhost/api/v1/companies', { headers: authorization ? { authorization } : {} })

  it('is a bearer token with the prefix', () => {
    expect(personalAccessTokenOf(request('Bearer invoices_abc'), prefix)).toBe('invoices_abc')
    expect(personalAccessTokenOf(request('bearer invoices_abc'), prefix)).toBe('invoices_abc')
  })

  it('is none for a JWT, another scheme or no header, which the app\'s other tokens answer', () => {
    expect(personalAccessTokenOf(request('Bearer eyJhbGciOiJFZERTQSJ9.e30.c2ln'), prefix)).toBeUndefined()
    expect(personalAccessTokenOf(request('DPoP invoices_abc'), prefix)).toBeUndefined()
    expect(personalAccessTokenOf(request(), prefix)).toBeUndefined()
  })
})
