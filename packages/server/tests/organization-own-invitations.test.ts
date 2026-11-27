import { describe, expect, it, vi } from 'vitest'
import { claimsOf, organizationsApp } from './support/organizations-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

const { serve } = organizationsApp()

describe("a person's own invitations", () => {
  it('are listed and shown for the address one is signed in as, and one of them accepted as that address only', async () => {
    const app = await serve({}, { people: true })
    const bo = await app.signIn('bo@example.com')
    const { id } = (await (await app.request('/api/auth/organization/invite-member', { cookie: bo, body: { email: 'ana@example.com', role: 'member', appRoles: ['sales'] } })).json()) as { id: string }
    const ana = await app.signIn('ana@example.com')
    const listed = await app.request('/api/auth/organization/list-user-invitations', { cookie: ana })
    expect(listed.status).toBe(200)
    expect(await listed.json()).toEqual([expect.objectContaining({ id, email: 'ana@example.com', role: 'member', appRoles: ['sales'], organizationName: 'Acme', status: 'pending' })])
    const sanne = await app.signIn('sanne@example.com')
    expect(await (await app.request('/api/auth/organization/list-user-invitations', { cookie: sanne })).json()).toEqual([])
    expect(await (await app.request(`/api/auth/organization/get-invitation?id=${id}`, { cookie: ana })).json()).toMatchObject({ id, organizationName: 'Acme', inviterEmail: 'bo@example.com' })

    expect(await (await app.request('/api/auth/invitation/accept-own', { cookie: sanne, body: { invitationId: id } })).json()).toMatchObject({ code: 'NOT_THE_INVITED_ADDRESS' })
    expect((await app.request('/api/auth/invitation/accept-own', { cookie: ana, body: { invitationId: id } })).status).toBe(200)
    expect(await claimsOf(app, ana)).toMatchObject({ role: 'support', org: '1', org_role: 'member' })
    expect(await (await app.request('/api/auth/organization/list-user-invitations', { cookie: ana })).json()).toEqual([])
    expect(await (await app.request('/api/auth/invitation/accept-own', { cookie: ana, body: { invitationId: id } })).json()).toMatchObject({ code: 'INVITATION_INVALID' })
  })
})
