import { describe, expect, it } from 'vitest'
import { invitationLinkHook, withInvitationLink } from './invitation-link-hook'
import { invitationToken, verifyInvitationToken } from './invitation-token'

const secret = 'test-secret-test-secret-test-secret-1234'
const url = 'https://app.example.com/-/invitation'

describe('invitationLinkHook', () => {
  it('matches the invite paths it is given, and no others', () => {
    const hook = invitationLinkHook(['/organization/invite-member', '/users/invite'], url)
    expect(hook.matcher({ path: '/organization/invite-member' })).toBe(true)
    expect(hook.matcher({ path: '/users/invite' })).toBe(true)
    expect(hook.matcher({ path: '/users/invitations' })).toBe(false)
    expect(hook.matcher({})).toBe(false)
  })

  it('adds the signed link of an organization invitation and of an app invitation alike', async () => {
    const expiresAt = new Date('2026-08-08T00:00:00Z')
    for (const answer of [{ id: 'org-1', organizationId: '1', expiresAt }, { id: 'app-1', email: 'ana@example.com', roles: ['sales'], expiresAt: expiresAt.toISOString() }]) {
      const linked = await withInvitationLink(answer, secret, url)
      expect(linked).toEqual({ ...answer, link: `${url}?token=${encodeURIComponent(await invitationToken(secret, { id: answer.id, expiresAt }))}` })
      const token = new URL(linked!.link).searchParams.get('token')!
      expect(await verifyInvitationToken(secret, token, { id: answer.id, expiresAt })).toBe(true)
    }
  })

  it('leaves errors and answers without an invitation alone', async () => {
    expect(await withInvitationLink(new Error('no'), secret, url)).toBeUndefined()
    expect(await withInvitationLink({ ok: true }, secret, url)).toBeUndefined()
    expect(await withInvitationLink(undefined, secret, url)).toBeUndefined()
  })
})
