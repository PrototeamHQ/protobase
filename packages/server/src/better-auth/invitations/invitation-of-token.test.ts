import { describe, expect, it } from 'vitest'
import type { AuthContext } from '../organizations/store'
import { invitationOfToken } from './invitation-of-token'
import { invitationToken } from './invitation-token'

const secret = 'test-secret-test-secret-test-secret-1234'
const later = new Date(Date.now() + 60_000)
const earlier = new Date(Date.now() - 60_000)

// An app invitation as a verification row and an organization invitation as Better Auth's invitation row.
const contextWith = ({ appExpiresAt = later, orgExpiresAt = later } = {}) =>
  ({
    secret,
    internalAdapter: {
      findVerificationValue: async (identifier: string) =>
        identifier === 'app-invitation:app-1' ? { identifier, value: JSON.stringify({ email: 'ana@example.com', roles: ['sales'], inviterId: 'root' }), expiresAt: appExpiresAt } : null,
    },
    adapter: {
      findOne: async ({ where }: { where: { value: string }[] }) =>
        where[0]!.value === 'org-1' ? { id: 'org-1', organizationId: '1', email: 'bo@example.com', role: 'member', appRoles: ['sales'], status: 'pending', expiresAt: orgExpiresAt, inviterId: 'root' } : null,
    },
  }) as unknown as AuthContext

const appToken = (expiresAt = later) => invitationToken(secret, { id: 'app-1', expiresAt })
const orgToken = (expiresAt = later) => invitationToken(secret, { id: 'org-1', expiresAt })

describe('invitationOfToken', () => {
  it('finds an invitation to the app, with or without organizations', async () => {
    for (const organizations of [false, true]) {
      expect(await invitationOfToken(contextWith(), await appToken(), { organizations })).toEqual({
        kind: 'app',
        invitation: { id: 'app-1', email: 'ana@example.com', roles: ['sales'], inviterId: 'root', expiresAt: later },
      })
    }
  })

  it("finds an organization's invitation only with organizations", async () => {
    expect(await invitationOfToken(contextWith(), await orgToken(), { organizations: true })).toMatchObject({ kind: 'organization', invitation: { id: 'org-1', organizationId: '1' } })
    await expect(invitationOfToken(contextWith(), await orgToken(), { organizations: false })).rejects.toMatchObject({ body: { code: 'INVITATION_INVALID' } })
  })

  it('refuses a forged signature', async () => {
    const forged = `app-1.${(await appToken()).split('.')[1]!.slice(0, -4)}AAAA`
    await expect(invitationOfToken(contextWith(), forged, { organizations: true })).rejects.toMatchObject({ body: { code: 'INVITATION_INVALID' } })
    await expect(invitationOfToken(contextWith(), 'nonsense', { organizations: true })).rejects.toMatchObject({ body: { code: 'INVITATION_INVALID' } })
  })

  it('refuses an expired invitation of either kind', async () => {
    await expect(invitationOfToken(contextWith({ appExpiresAt: earlier }), await appToken(earlier), { organizations: false })).rejects.toMatchObject({ body: { code: 'INVITATION_INVALID' } })
    await expect(invitationOfToken(contextWith({ orgExpiresAt: earlier }), await orgToken(earlier), { organizations: true })).rejects.toMatchObject({ body: { code: 'INVITATION_INVALID' } })
  })
})
