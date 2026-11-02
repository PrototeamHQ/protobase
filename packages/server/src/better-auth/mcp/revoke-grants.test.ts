import { describe, expect, it } from 'vitest'
import { fakeAdapter } from '../testing/fake-adapter'
import { grantOwnerToRevoke, revokeMcpGrants, type FinishedRequest } from './revoke-grants'

const own = (path: string, body: unknown = {}, returned: unknown = { status: true }): FinishedRequest => ({ path, body, context: { session: { user: { id: 'ana' } }, returned } })
const admin = (path: string, body: unknown, returned: unknown = { status: true }): FinishedRequest => ({ path, body, context: { session: { user: { id: 'root' } }, returned } })

describe('whose MCP clients a finished request disconnects', () => {
  it("is the person's own when they sign out everywhere or their other devices", () => {
    expect(grantOwnerToRevoke(own('/revoke-sessions'))).toBe('ana')
    expect(grantOwnerToRevoke(own('/revoke-other-sessions'))).toBe('ana')
  })

  it("is the person's own after every password change, which always signs out the other devices", () => {
    expect(grantOwnerToRevoke(own('/change-password', { revokeOtherSessions: true }))).toBe('ana')
    expect(grantOwnerToRevoke(own('/change-password', { revokeOtherSessions: false }))).toBe('ana')
    expect(grantOwnerToRevoke(own('/change-password', {}))).toBe('ana')
    expect(grantOwnerToRevoke(own('/change-password', {}, new Error('INVALID_PASSWORD')))).toBeUndefined()
  })

  it("is the user's an admin ends the sessions of, bans or sets the password of", () => {
    expect(grantOwnerToRevoke(admin('/admin/revoke-user-sessions', { userId: 'ana' }))).toBe('ana')
    expect(grantOwnerToRevoke(admin('/admin/ban-user', { userId: 'ana' }))).toBe('ana')
    expect(grantOwnerToRevoke(admin('/admin/set-user-password', { userId: 'ana', newPassword: 'x' }))).toBe('ana')
  })

  it('is the user an update bans or marks unverified, whatever the type of the value', () => {
    for (const data of [{ banned: true }, { banned: 'true' }, { banned: 1 }, { emailVerified: false }, { emailVerified: 'false' }, { emailVerified: 0 }, { emailVerified: null }]) {
      expect(grantOwnerToRevoke(admin('/admin/update-user', { userId: 'ana', data }))).toBe('ana')
    }
  })

  it('is nobody for an update that neither bans nor marks unverified', () => {
    for (const data of [{ name: 'Ana' }, { banned: false }, { emailVerified: true }, { role: 'sales' }]) {
      expect(grantOwnerToRevoke(admin('/admin/update-user', { userId: 'ana', data }))).toBeUndefined()
    }
  })

  it('is nobody when the request failed', () => {
    expect(grantOwnerToRevoke(own('/revoke-sessions', {}, new Error('refused')))).toBeUndefined()
    expect(grantOwnerToRevoke(admin('/admin/ban-user', { userId: 'ana' }, new Error('forbidden')))).toBeUndefined()
  })

  it('is nobody for another request', () => {
    expect(grantOwnerToRevoke(own('/sign-out'))).toBeUndefined()
    expect(grantOwnerToRevoke(admin('/admin/unban-user', { userId: 'ana' }))).toBeUndefined()
  })
})

const rows = () => ({
  oauthConsent: [
    { id: 'c1', userId: 'ana', clientId: 'assistant' },
    { id: 'c2', userId: 'ana', clientId: 'editor' },
    { id: 'c3', userId: 'bo', clientId: 'assistant' },
  ],
  oauthAccessToken: [
    { id: 'a1', userId: 'ana', clientId: 'assistant' },
    { id: 'a2', userId: 'bo', clientId: 'assistant' },
  ],
  oauthRefreshToken: [
    { id: 'r1', userId: 'ana', clientId: 'assistant' },
    { id: 'r2', userId: 'ana', clientId: 'editor' },
    { id: 'r3', userId: 'bo', clientId: 'assistant' },
  ],
})

const ids = (tables: Record<string, Record<string, unknown>[]>) => Object.fromEntries(Object.entries(tables).map(([model, list]) => [model, list.map((row) => row.id)]))

describe('disconnecting MCP clients', () => {
  it("removes every consent and token of the user's, and no one else's", async () => {
    const { tables, adapter } = fakeAdapter(rows())
    await revokeMcpGrants(adapter, 'ana')
    expect(ids(tables)).toEqual({ oauthConsent: ['c3'], oauthAccessToken: ['a2'], oauthRefreshToken: ['r3'] })
  })

  it("removes only one client's, given it", async () => {
    const { tables, adapter } = fakeAdapter(rows())
    await revokeMcpGrants(adapter, 'ana', 'assistant')
    expect(ids(tables)).toEqual({ oauthConsent: ['c2', 'c3'], oauthAccessToken: ['a2'], oauthRefreshToken: ['r2', 'r3'] })
  })
})

describe('disconnecting, when the store fails on the way', () => {
  it('has forgotten the consent first, so a refresh token left behind is refused', async () => {
    const { tables, adapter } = fakeAdapter(rows())
    const failing = { deleteMany: async (input: { model: string }) => (input.model === 'oauthRefreshToken' ? Promise.reject(new Error('connection lost')) : adapter.deleteMany(input as never)) }
    await expect(revokeMcpGrants(failing as never, 'ana')).rejects.toThrow('connection lost')
    expect(ids(tables).oauthConsent).toEqual(['c3'])
    expect(ids(tables).oauthRefreshToken).toEqual(['r1', 'r2', 'r3'])
  })
})
