import { describe, expect, it, vi } from 'vitest'
import { everyOrganization } from '@protobase/query'
import { listOrganizations } from '../src/better-auth/organizations/host'
import { claimsOf, organizationsApp } from './support/organizations-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

const { serve } = organizationsApp()

describe('managing members', () => {
  it('hands ownership over in one step', async () => {
    const app = await serve({}, { people: true })
    const bo = await app.signIn('bo@example.com')
    const members = await (await app.request('/api/auth/organization/list-members?organizationId=1', { cookie: bo })).json()
    const sanneId = members.members.find((member: { user: { email: string } }) => member.user.email === 'sanne@example.com').id
    expect((await app.request('/api/auth/organization/transfer-ownership', { cookie: await app.signIn('sanne@example.com'), body: { memberId: sanneId } })).status).toBe(403)
    expect((await app.request('/api/auth/organization/transfer-ownership', { cookie: bo, body: { memberId: sanneId } })).status).toBe(200)
    const acme = (await listOrganizations(app.auth, everyOrganization('the test reads every organization'))).organizations[0]!
    expect(acme.members).toEqual(expect.arrayContaining([expect.objectContaining({ email: 'sanne@example.com', role: 'owner' }), expect.objectContaining({ email: 'bo@example.com', role: 'admin' })]))
  })

  it('takes a removed member out of the organization on their other sessions, and ends the token they hold', async () => {
    const app = await serve({}, { people: true })
    const sanne = await app.signIn('sanne@example.com')
    expect(await claimsOf(app, sanne)).toMatchObject({ org: '1' })
    const token = await app.tokenOf(sanne)
    expect((await app.request('/api/v1/companies?page_size=1', { token })).status).toBe(200)
    expect((await app.request('/api/auth/organization/remove-member', { cookie: await app.signIn('bo@example.com'), body: { memberIdOrEmail: 'sanne@example.com', organizationId: '1' } })).status).toBe(200)
    expect((await app.request('/api/v1/companies?page_size=1', { token })).status).toBe(401)
    expect(await claimsOf(app, sanne)).not.toHaveProperty('org')
  })

  it('takes a removed member out of the organization on every session, past the 100 rows a read returns untold', async () => {
    const app = await serve({}, { people: true })
    await app.store.query(`insert into session (id, user_id, token, expires_at, updated_at, active_organization_id)
      select 'many-' || i, u.id, 'many-token-' || i, timestamptz '2026-08-02 00:00:00+00', timestamptz '2026-08-01 00:00:00+00', '1'
      from "user" u, generate_series(1, 150) i where u.email = 'sanne@example.com'`)
    expect((await app.request('/api/auth/organization/remove-member', { cookie: await app.signIn('bo@example.com'), body: { memberIdOrEmail: 'sanne@example.com', organizationId: '1' } })).status).toBe(200)
    const { rows } = await app.store.query(`select count(*)::int as left_in from session s join "user" u on u.id = s.user_id where u.email = 'sanne@example.com' and s.active_organization_id is not null`)
    expect(rows).toEqual([{ left_in: 0 }])
  })
})
