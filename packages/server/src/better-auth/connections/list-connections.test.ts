import { describe, expect, it, vi } from 'vitest'
import type { ConnectionEvents } from './connection-events'
import { resolveConnections } from './declared-connections'
import { listConnections } from './list-connections'

const connections = resolveConnections(
  [{ plugin: 'acme', name: 'account', declaration: { label: 'Acme account', scopes: ['openid'], oauth: { authorization_url: 'https://acme.example/authorize', token_url: 'https://acme.example/token', user_info_url: 'https://acme.example/userinfo' } } }],
  { 'acme:account': { clientId: 'acme-client', clientSecret: 'acme-client-secret-value' } },
  {},
  false,
)
const provider = connections[0]!.providerId
const createdAt = new Date('2026-11-02T09:00:00Z')

// Rows as the store keeps them, with their tokens: Ada's and Bob's accounts.
const rows = [
  { id: 'acc-ada', userId: 'u-ada', providerId: provider, accountId: 'ada@acme', scope: 'openid', createdAt, updatedAt: createdAt, accessToken: 'access-value', refreshToken: 'refresh-value', idToken: 'id-value', password: 'password-value', accessTokenExpiresAt: createdAt },
  { id: 'acc-bob', userId: 'u-bob', providerId: provider, accountId: 'bob@acme', scope: 'openid', createdAt, updatedAt: createdAt, accessToken: 'bob-access-value' },
]
const findAccounts = vi.fn(async (userId: string) => rows.filter((row) => row.userId === userId))
const events = (uses: ConnectionEvents['uses'] = async () => ({})) => ({ needsSignIn: async () => [], uses })

describe('listConnections', () => {
  it("picks each account's id, scopes, date, sign-in and uses, and nothing of its token or other columns", async () => {
    const listed = await listConnections({ findAccounts, connections, events: events(async () => ({ 'acc-ada': [{ id: 'wf-1', name: 'Report' }] })) }, 'u-ada')
    expect(listed[0]!.accounts).toEqual([{ id: 'acc-ada', scopes: ['openid'], created_at: createdAt, needs_sign_in: false, used_by: [{ id: 'wf-1', name: 'Report' }] }])
    for (const secret of ['access-value', 'refresh-value', 'id-value', 'password-value', 'acme-client-secret-value', 'ada@acme']) expect(JSON.stringify(listed)).not.toContain(secret)
  })

  it("lists only the person's own accounts, and asks what uses them for that person and those accounts alone", async () => {
    const uses = vi.fn<ConnectionEvents['uses']>(async () => ({}))
    const listed = await listConnections({ findAccounts, connections, events: events(uses) }, 'u-ada')
    expect(listed.flatMap(({ accounts }) => accounts.map(({ id }) => id))).toEqual(['acc-ada'])
    expect(uses).toHaveBeenCalledExactlyOnceWith('u-ada', ['acc-ada'])
  })

  it('reads a numeric id as text', async () => {
    findAccounts.mockClear()
    await listConnections({ findAccounts, connections, events: events() }, 7)
    expect(findAccounts).toHaveBeenCalledWith('7')
  })

  it('reads nothing without a person', async () => {
    findAccounts.mockClear()
    for (const user of ['', undefined, null] as unknown as string[]) await expect(listConnections({ findAccounts, connections, events: events() }, user)).rejects.toThrow("signed-in person's id")
    expect(findAccounts).not.toHaveBeenCalled()
  })
})
