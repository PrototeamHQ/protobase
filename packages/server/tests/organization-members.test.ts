import { describe, expect, it, vi } from 'vitest'
import { setMemberRoles } from '../src/better-auth/organizations/host'
import { organizationsApp } from './support/organizations-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

const { serve } = organizationsApp()

describe('managing members', () => {
  it('changes app roles only within what the caller may give, and only for owners, admins and superusers', async () => {
    const app = await serve({}, { people: true })
    const members = await (await app.request('/api/auth/organization/list-members?organizationId=1', { cookie: await app.signIn('bo@example.com') })).json()
    const sanneId = members.members.find((member: { user: { email: string } }) => member.user.email === 'sanne@example.com').id
    const bo = await app.signIn('bo@example.com')
    expect(await (await app.request('/api/auth/organization/set-app-roles', { cookie: bo, body: { memberId: sanneId, appRoles: ['sales', 'accountant'] } })).json()).toMatchObject({ member: { appRoles: ['sales', 'accountant'] } })
    const sanne = await app.signIn('sanne@example.com')
    expect(await (await app.request('/api/auth/organization/set-app-roles', { cookie: sanne, body: { memberId: sanneId, appRoles: ['sales'] } })).json()).toMatchObject({ code: 'NOT_AN_ORGANIZATION_ADMIN' })
    await setMemberRoles(app.auth, { organization: 'acme', email: 'sanne@example.com', role: 'admin', appRoles: ['sales', 'accountant'] })
    const boId = members.members.find((member: { user: { email: string } }) => member.user.email === 'bo@example.com').id
    // Sanne may not take manager away from Bo: she does not hold it, nor a role that grants it
    expect(await (await app.request('/api/auth/organization/set-app-roles', { cookie: sanne, body: { memberId: boId, appRoles: ['support', 'sales', 'accountant'] } })).json()).toMatchObject({ code: 'APP_ROLE_NOT_GRANTABLE' })
    const root = await app.signIn('root@example.com')
    expect((await app.request('/api/auth/organization/set-app-roles', { cookie: root, body: { memberId: sanneId, appRoles: ['manager'] } })).status).toBe(200)
  })

  it('lists members with their app roles, and answers the organization a session works in', async () => {
    const app = await serve({}, { people: true })
    const sanne = await app.signIn('sanne@example.com')
    const { members } = await (await app.request('/api/auth/organization/list-members?organizationId=1', { cookie: sanne })).json()
    expect(members).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'member', appRoles: ['sales'], user: expect.objectContaining({ email: 'sanne@example.com' }) })]))
    expect(await (await app.request('/api/auth/organization/current', { cookie: sanne })).json()).toEqual({
      organization: { id: '1', name: 'Acme', slug: 'acme', logo: null },
      role: 'member',
      appRoles: ['sales'],
      memberId: expect.any(String),
      globalRoles: [],
    })
    const ana = await app.signIn('ana@example.com')
    expect(await (await app.request('/api/auth/organization/current', { cookie: ana })).json()).toEqual({ organization: null, globalRoles: ['support'] })
    expect((await (await app.request('/api/auth/status')).json()).organizations).toEqual({
      create: 'everyone',
      roles: [
        { name: 'admin', label: 'Superuser', membership: false, grants: [] },
        { name: 'support', label: 'Support', membership: true, grants: [] },
        { name: 'manager', label: 'Manager', membership: true, grants: ['accountant'] },
        { name: 'sales', label: 'Sales', membership: true, grants: [] },
        { name: 'accountant', label: 'Accountant', membership: true, grants: [] },
        { name: 'user', label: 'No global role', membership: false, grants: [] },
      ],
    })
  })

  it("answers the people of the organization one works in to its members only, by user id and name, never an address", async () => {
    const app = await serve({}, { people: true })
    const sanne = await app.signIn('sanne@example.com')
    const { members } = await (await app.request('/api/auth/organization/list-members?organizationId=1', { cookie: sanne })).json()
    const userIdOf = (email: string) => members.find((member: { user: { email: string } }) => member.user.email === email).userId
    const acme = { people: [{ id: userIdOf('bo@example.com'), name: 'bo' }, { id: userIdOf('sanne@example.com'), name: 'sanne' }] }
    const answer = await app.request('/api/auth/organization/people', { cookie: sanne })
    const body = await answer.text()
    expect(JSON.parse(body)).toEqual(acme)
    expect(body).not.toContain('@example.com')
    // Another organization's id in the request changes nothing: the session's organization decides
    expect(await (await app.request('/api/auth/organization/people?organizationId=2', { cookie: sanne })).json()).toEqual(acme)
    expect(JSON.stringify(await (await app.request('/api/auth/organization/people', { cookie: await app.signIn('root@example.com') })).json())).not.toContain(userIdOf('sanne@example.com'))
    // A global role that enters an organization without being a member of it does not get them
    const ana = await app.signIn('ana@example.com')
    expect((await app.request('/api/auth/organization/people', { cookie: ana })).status).toBe(403)
    expect((await app.request('/api/auth/organization/switch', { cookie: ana, body: { organizationId: '1' } })).status).toBe(200)
    expect((await app.request('/api/auth/organization/people', { cookie: ana })).status).toBe(403)
    expect((await app.request('/api/auth/organization/people')).status).toBe(401)
    expect((await app.request('/api/auth/organization/remove-member', { cookie: await app.signIn('bo@example.com'), body: { memberIdOrEmail: 'sanne@example.com', organizationId: '1' } })).status).toBe(200)
    expect((await app.request('/api/auth/organization/people', { cookie: sanne })).status).toBe(403)
  })
})
