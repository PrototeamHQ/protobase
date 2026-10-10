import { PGlite } from '@electric-sql/pglite'
import { decodeJwt } from 'jose'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { authSchemaMigration, checkAuthSchema } from '../src/better-auth/auth-schema'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../src/better-auth/create-auth'
import { addMember, createOrganization, listOrganizations, setMemberRoles } from '../src/better-auth/organizations/host'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import type { AuditEvent } from '../src/types'
import { createAuthStore } from '../../../test-support/auth'
import { allResources, createFixtureDb } from '../../../test-support/server'

const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'
const password = 'correct horse battery'

// The fixture's tenant columns are integers holding 1 and 2, so the organizations get those ids.
const roles: CreateAuthOptions['roles'] = {
  support: 'Support',
  manager: { label: 'Manager', grants: ['accountant'] },
  sales: 'Sales',
  accountant: 'Accountant',
}

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
let base: PGlite
beforeAll(async () => {
  fixture = await createFixtureDb()
  base = await createAuthStore()
})
afterAll(async () => { await fixture.db.destroy() })

let client = 0

/** An app with organizations on a copy of the auth store, brought up to date the way a project's migration does. */
const serve = async (options: Partial<CreateAuthOptions> = {}) => {
  const store = (await base.clone()) as PGlite
  const ids = ['1', '2', '3']
  const make = () =>
    createAuth({
      database: { dialect: new PGliteDialect(store), type: 'postgres' },
      baseURL: origin,
      secret,
      mailer: false,
      signInPerMinute: 100,
      roles,
      organizations: { generateId: () => ids.shift()!, create: 'everyone' },
      ...options,
    })
  // Better Auth checks the schema once per instance as soon as it is made, so the app's instance comes after the
  // migration, as it does when a project migrates before it starts.
  const migration = await authSchemaMigration(make())
  await store.exec(migration!)
  const auth = make()
  const audited: AuditEvent[] = []
  const audit = { publish: async (event: AuditEvent) => void audited.push(event) }
  const app = createAdmin({ resources: allResources, db: fixture.db, authenticate: betterAuthAuthenticator({ auth }), auth, options: { audit } })
  const address = `198.51.100.${++client}`
  const request = (path: string, init: { body?: unknown; cookie?: string; token?: string } = {}) =>
    app.request(`${origin}${path}`, {
      method: init.body === undefined ? 'GET' : 'POST',
      headers: {
        'content-type': 'application/json',
        origin,
        'x-forwarded-for': address,
        ...(init.cookie && { cookie: init.cookie }),
        ...(init.token && { authorization: `Bearer ${init.token}` }),
      },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    })
  const signIn = async (email: string) => {
    const response = await request('/api/auth/sign-in/email', { body: { email, password } })
    expect(response.status).toBe(200)
    return response.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
  }
  const tokenOf = async (cookie: string) => ((await (await request('/api/auth/token', { cookie })).json()) as { token: string }).token
  return { auth, store, migration, audited, request, signIn, tokenOf }
}

/** Root (superuser), Bo (owns Acme), Sanne (sales in Acme), Ana (global support, in no organization). */
const people = async (auth: ReturnType<typeof createAuth>) => {
  await createUser(auth, { email: 'root@example.com', password })
  await createUser(auth, { email: 'bo@example.com', password })
  await createUser(auth, { email: 'sanne@example.com', password })
  await createUser(auth, { email: 'ana@example.com', password, role: 'support' })
  const acme = await createOrganization(auth, { name: 'Acme', slug: 'acme', owner: 'bo@example.com' })
  const globex = await createOrganization(auth, { name: 'Globex', slug: 'globex', owner: 'root@example.com' })
  await addMember(auth, { organization: 'acme', email: 'sanne@example.com', appRoles: ['sales'] })
  return { acme: acme.organization, globex: globex.organization }
}

describe('the auth schema with organizations', () => {
  it('gets the organization tables and columns in snake_case, and the server starts once they exist', async () => {
    const { auth, migration } = await serve()
    expect(migration).toContain('create table if not exists "organization"')
    expect(migration).toContain('"app_roles" jsonb')
    expect(migration).toMatch(/alter table "session" add column if not exists "active_organization_id"/)
    expect(migration).toMatch(/alter table "user" add column if not exists "last_organization_id"/)
    await expect(checkAuthSchema(auth)).resolves.toBeUndefined()
    expect(await authSchemaMigration(auth)).toBeUndefined()
  })

  it('stays as it was without organizations', async () => {
    const auth = createAuth({ database: { dialect: new PGliteDialect((await base.clone()) as PGlite), type: 'postgres' }, baseURL: origin, secret, mailer: false })
    expect(await authSchemaMigration(auth)).toBeUndefined()
    expect(auth.organizations).toBeUndefined()
  })
})

describe('organizations on the host', () => {
  it('make the creator owner with every app role a member can hold, and keep members with the roles given', async () => {
    const { auth } = await serve()
    await people(auth)
    expect(await listOrganizations(auth)).toEqual([
      { id: '1', name: 'Acme', slug: 'acme', members: expect.arrayContaining([
        { email: 'bo@example.com', role: 'owner', appRoles: ['support', 'manager', 'sales', 'accountant'] },
        { email: 'sanne@example.com', role: 'member', appRoles: ['sales'] },
      ]) },
      { id: '2', name: 'Globex', slug: 'globex', members: [{ email: 'root@example.com', role: 'owner', appRoles: ['support', 'manager', 'sales', 'accountant'] }] },
    ])
    await expect(addMember(auth, { organization: 'acme', email: 'ana@example.com', appRoles: ['admin'] })).rejects.toThrow('A member cannot hold "admin"')
    await expect(createOrganization(auth, { name: 'Acme again', slug: 'acme', owner: 'bo@example.com' })).rejects.toThrow('exists already')
  })
})

describe('the token of a signed-in person', () => {
  it('carries the organization they start in, their organization role and app roles; the API sees only its rows', async () => {
    const { auth, request, signIn, tokenOf } = await serve()
    await people(auth)
    const token = await tokenOf(await signIn('sanne@example.com'))
    expect(decodeJwt(token)).toMatchObject({ role: 'user', org: '1', org_role: 'member', app_roles: ['sales'] })
    const companies = await (await request('/api/v1/companies?page_size=500', { token })).json()
    expect(companies.items.length).toBeGreaterThan(0)
    expect(new Set(companies.items.map((company: { organizationId: number }) => company.organizationId))).toEqual(new Set([1]))
  })

  it('adds the global roles to the membership roles, without the placeholder user', async () => {
    const { auth, signIn, tokenOf } = await serve()
    await people(auth)
    const authenticate = betterAuthAuthenticator({ auth })
    const session = await authenticate(new Request(origin, { headers: { authorization: `Bearer ${await tokenOf(await signIn('root@example.com'))}` } }))
    expect(session).toEqual({ user: { id: expect.any(String), roles: ['admin', 'support', 'manager', 'sales', 'accountant'] }, tenant: '2', organization: { id: '2' } })
    const sanne = await authenticate(new Request(origin, { headers: { authorization: `Bearer ${await tokenOf(await signIn('sanne@example.com'))}` } }))
    expect(sanne.user.roles).toEqual(['sales'])
  })

  it('has no organization for someone in none, and the tenant resources refuse them', async () => {
    const { auth, request, signIn, tokenOf } = await serve()
    await people(auth)
    const token = await tokenOf(await signIn('ana@example.com'))
    expect(decodeJwt(token)).not.toHaveProperty('org')
    expect((await request('/api/v1/companies', { token })).status).toBe(403)
  })
})

const claimsOf = async (app: Awaited<ReturnType<typeof serve>>, cookie: string) => decodeJwt(await app.tokenOf(cookie))

describe('inviting people', () => {
  it('gives the inviter the link without a mailer, and makes an account for a new address from it', async () => {
    const app = await serve()
    await people(app.auth)
    const bo = await app.signIn('bo@example.com')
    const invited = await app.request('/api/auth/organization/invite-member', { cookie: bo, body: { email: 'jan@ledger.example', role: 'member', appRoles: ['accountant'] } })
    expect(invited.status).toBe(200)
    const { link } = (await invited.json()) as { link: string }
    expect(link).toMatch(/^http:\/\/localhost:5173\/-\/invitation\?token=/)
    const token = decodeURIComponent(new URL(link).searchParams.get('token')!)

    const preview = await (await app.request(`/api/auth/invitation?token=${encodeURIComponent(token)}`)).json()
    expect(preview).toMatchObject({ organization: { id: '1', name: 'Acme' }, inviter: { name: 'bo' }, email: 'jan@ledger.example', role: 'member', appRoles: ['accountant'], hasAccount: false })
    expect((await app.request(`/api/auth/invitation?token=${encodeURIComponent(token.slice(0, -2))}`)).status).toBe(400)

    const signedUp = await app.request('/api/auth/invitation/sign-up', { body: { token, name: 'Jan', password } })
    expect(signedUp.status).toBe(200)
    const jan = signedUp.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
    expect(await claimsOf(app, jan)).toMatchObject({ role: 'user', org: '1', org_role: 'member', app_roles: ['accountant'] })
    // The link works once
    expect((await app.request('/api/auth/invitation/sign-up', { body: { token, name: 'Jan', password } })).status).toBe(400)
    expect(await app.signIn('jan@ledger.example')).toContain('session_token')
  })

  it('emails the link with a mailer, and leaves it out of the answer', async () => {
    const sent: { to: string; subject: string; text: string }[] = []
    const app = await serve({ mailer: { send: async (message) => void sent.push(message) } })
    await people(app.auth)
    const answer = await (await app.request('/api/auth/organization/invite-member', { cookie: await app.signIn('bo@example.com'), body: { email: 'jan@ledger.example', role: 'member', appRoles: ['accountant'] } })).json()
    expect(answer).not.toHaveProperty('link')
    // Mail goes out after the answer
    await expect.poll(() => sent.length).toBe(1)
    expect(sent[0]).toMatchObject({ to: 'jan@ledger.example', subject: 'Join Acme', text: expect.stringContaining('http://localhost:5173/-/invitation?token=') })
    const token = decodeURIComponent(/token=(\S+)/.exec(sent[0]!.text)![1]!)
    expect((await app.request(`/api/auth/invitation?token=${encodeURIComponent(token)}`)).status).toBe(200)
  })

  it('lets someone with an account accept signed in as the invited address only', async () => {
    const app = await serve()
    await people(app.auth)
    const bo = await app.signIn('bo@example.com')
    const { link } = (await (await app.request('/api/auth/organization/invite-member', { cookie: bo, body: { email: 'ana@example.com', role: 'member', appRoles: ['sales'] } })).json()) as { link: string }
    const token = new URL(link).searchParams.get('token')!
    expect((await app.request('/api/auth/invitation/sign-up', { body: { token, name: 'Ana', password } })).status).toBe(400)
    expect(await (await app.request('/api/auth/invitation/accept', { cookie: await app.signIn('sanne@example.com'), body: { token } })).json()).toMatchObject({ code: 'NOT_THE_INVITED_ADDRESS' })
    const ana = await app.signIn('ana@example.com')
    expect((await app.request('/api/auth/invitation/accept', { cookie: ana, body: { token } })).status).toBe(200)
    expect(await claimsOf(app, ana)).toMatchObject({ role: 'support', org: '1', org_role: 'member', app_roles: ['sales'] })
    expect((await app.request('/api/auth/organization/accept-invitation', { cookie: ana, body: { invitationId: invitationIdFrom(token) } })).status).toBe(404)
  })

  it('refuses app roles the inviter neither holds nor is granted by a role they hold', async () => {
    const app = await serve()
    await people(app.auth)
    await setMemberRoles(app.auth, { organization: 'acme', email: 'sanne@example.com', role: 'admin', appRoles: ['sales'] })
    const sanne = await app.signIn('sanne@example.com')
    const invite = (appRoles: string[], email = 'kim@example.com') => app.request('/api/auth/organization/invite-member', { cookie: sanne, body: { email, role: 'member', appRoles } })
    expect(await (await invite(['accountant'])).json()).toMatchObject({ code: 'APP_ROLE_NOT_GRANTABLE' })
    expect((await invite(['sales'])).status).toBe(200)
    // manager grants accountant
    await setMemberRoles(app.auth, { organization: 'acme', email: 'sanne@example.com', appRoles: ['manager'] })
    expect((await invite(['accountant'], 'lou@example.com')).status).toBe(200)
  })
})

const invitationIdFrom = (token: string) => token.slice(0, token.lastIndexOf('.'))

describe('managing members', () => {
  it('changes app roles only within what the caller may give, and only for owners, admins and superusers', async () => {
    const app = await serve()
    await people(app.auth)
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
    const app = await serve()
    await people(app.auth)
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

  it('hands ownership over in one step', async () => {
    const app = await serve()
    await people(app.auth)
    const bo = await app.signIn('bo@example.com')
    const members = await (await app.request('/api/auth/organization/list-members?organizationId=1', { cookie: bo })).json()
    const sanneId = members.members.find((member: { user: { email: string } }) => member.user.email === 'sanne@example.com').id
    expect((await app.request('/api/auth/organization/transfer-ownership', { cookie: await app.signIn('sanne@example.com'), body: { memberId: sanneId } })).status).toBe(403)
    expect((await app.request('/api/auth/organization/transfer-ownership', { cookie: bo, body: { memberId: sanneId } })).status).toBe(200)
    const acme = (await listOrganizations(app.auth))[0]!
    expect(acme.members).toEqual(expect.arrayContaining([expect.objectContaining({ email: 'sanne@example.com', role: 'owner' }), expect.objectContaining({ email: 'bo@example.com', role: 'admin' })]))
  })

  it('takes a removed member out of the organization on their other sessions', async () => {
    const app = await serve()
    await people(app.auth)
    const sanne = await app.signIn('sanne@example.com')
    expect(await claimsOf(app, sanne)).toMatchObject({ org: '1' })
    expect((await app.request('/api/auth/organization/remove-member', { cookie: await app.signIn('bo@example.com'), body: { memberIdOrEmail: 'sanne@example.com', organizationId: '1' } })).status).toBe(200)
    expect(await claimsOf(app, sanne)).not.toHaveProperty('org')
  })
})

describe('working in another organization', () => {
  it('lets someone with a global role enter any organization, audited, with only their global roles there', async () => {
    const app = await serve()
    await people(app.auth)
    const ana = await app.signIn('ana@example.com')
    const found = await (await app.request('/api/auth/organization/search?query=Glo', { cookie: ana })).json()
    expect(found).toEqual({ organizations: [{ id: '2', name: 'Globex', slug: 'globex' }] })
    expect((await app.request('/api/auth/organization/switch', { cookie: ana, body: { organizationId: '2' } })).status).toBe(200)
    expect(app.audited).toEqual([{ type: 'organization.entered', at: expect.any(String), actor: { id: expect.any(String), roles: ['support'] }, organization: '2', origin: expect.any(Object) }])
    const claims = await claimsOf(app, ana)
    expect(claims).toMatchObject({ role: 'support', org: '2' })
    expect(claims).not.toHaveProperty('org_role')
    // The next sign-in starts there
    expect(await claimsOf(app, await app.signIn('ana@example.com'))).toMatchObject({ org: '2' })
  })

  it('refuses someone without a global role an organization they are not in, and the search', async () => {
    const app = await serve()
    await people(app.auth)
    const sanne = await app.signIn('sanne@example.com')
    expect(await (await app.request('/api/auth/organization/switch', { cookie: sanne, body: { organizationId: '2' } })).json()).toMatchObject({ code: 'NOT_A_MEMBER' })
    expect((await app.request('/api/auth/organization/search?query=Glo', { cookie: sanne })).status).toBe(403)
    expect((await app.request('/api/auth/organization/set-active', { cookie: sanne, body: { organizationId: '1' } })).status).toBe(404)
    expect(app.audited).toEqual([])
  })
})

describe('deleting an organization', () => {
  it('is refused while it has records, and done once it has none', async () => {
    const app = await serve()
    await people(app.auth)
    const bo = await app.signIn('bo@example.com')
    const refused = await app.request('/api/auth/organization/delete', { cookie: bo, body: { organizationId: '1' } })
    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ code: 'ORGANIZATION_HAS_RECORDS', message: expect.stringContaining('companies') })
    await createOrganization(app.auth, { name: 'Empty', slug: 'empty', owner: 'bo@example.com' })
    expect((await app.request('/api/auth/organization/delete', { cookie: bo, body: { organizationId: '3' } })).status).toBe(200)
    expect((await listOrganizations(app.auth)).map((organization) => organization.slug)).toEqual(['acme', 'globex'])
  })
})
