import { PGlite } from '@electric-sql/pglite'
import { decodeJwt } from 'jose'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { authSchemaMigration, checkAuthSchema } from '../src/better-auth/auth-schema'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../src/better-auth/create-auth'
import { addMember, createOrganization, listOrganizations } from '../src/better-auth/organizations/host'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
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
  const app = createAdmin({ resources: allResources, db: fixture.db, authenticate: betterAuthAuthenticator({ auth }), auth })
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
  return { auth, store, migration, request, signIn, tokenOf }
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
