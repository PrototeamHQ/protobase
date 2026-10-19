import { describe, expect, it } from 'vitest'
import { invitationIdOf, invitationLink, invitationToken, verifyInvitationToken } from './invitation-token'

const secret = 'test-secret-test-secret-test-secret-1234'
const invitation = { id: 'inv_123', expiresAt: new Date('2026-10-17T12:00:00Z') }

describe('the invitation token', () => {
  it('names the invitation and verifies against its expiry with the same secret', async () => {
    const token = await invitationToken(secret, invitation)
    expect(invitationIdOf(token)).toBe('inv_123')
    expect(await verifyInvitationToken(secret, token, invitation)).toBe(true)
    expect(invitationLink('https://admin.example.com/-/invitation', token)).toBe(`https://admin.example.com/-/invitation?token=${encodeURIComponent(token)}`)
  })

  it('fails for another secret, a moved expiry (a resend), or the bare id', async () => {
    const token = await invitationToken(secret, invitation)
    expect(await verifyInvitationToken('another-secret-another-secret-12345678', token, invitation)).toBe(false)
    expect(await verifyInvitationToken(secret, token, { ...invitation, expiresAt: new Date('2026-10-18T12:00:00Z') })).toBe(false)
    expect(await verifyInvitationToken(secret, 'inv_123', invitation)).toBe(false)
    expect(invitationIdOf('no-dot')).toBeUndefined()
  })
})
