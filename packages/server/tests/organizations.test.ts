import { describe, expect, it, vi } from 'vitest'
import { everyOrganization } from '@protobase/query'
import { authSchemaMigration } from '../src/better-auth/auth-schema'
import { createAuth } from '../src/better-auth/create-auth'
import { addAppRoleToOwners, addMember, createOrganization, isMemberByEmail, listOrganizations, removeMember, setMemberRoles } from '../src/better-auth/organizations/host'
import { createUser, listUsers } from '../src/better-auth/users'
import { claimsOf, organizationsApp, origin, password, secret } from './support/organizations-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

const { serve, migrated } = organizationsApp()

describe('the auth schema with organizations', () => {
  it('has the organization tables and columns in snake_case in every store, and the server starts', async () => {
    const { auth, store } = await serve()
    const { rows } = await store.query<{ name: string }>(
      "select table_name || '.' || column_name as name from information_schema.columns where (table_name, column_name) in (('organization', 'slug'), ('member', 'app_roles'), ('session', 'active_organization_id'), ('user', 'last_organization_id')) order by 1",
    )
    expect(rows.map((row) => row.name)).toEqual(['member.app_roles', 'organization.slug', 'session.active_organization_id', 'user.last_organization_id'])
    expect(await authSchemaMigration(auth)).toBeUndefined()
  })

  it('writes no step once organizations are off, the store keeping their tables', async () => {
    const auth = createAuth({ database: { dialect: (await migrated().clone()).dialect, type: 'postgres' }, baseURL: origin, secret, mailer: false })
    expect(await authSchemaMigration(auth)).toBeUndefined()
    expect(auth.organizations).toBeUndefined()
  })
})

describe('organizations on the host', () => {
  it('make the creator owner with every app role a member can hold, and keep members with the roles given', async () => {
    const { auth } = await serve({}, { people: true })
    expect((await listOrganizations(auth, everyOrganization('the test reads every organization'))).organizations).toEqual([
      { id: '1', name: 'Acme', slug: 'acme', members: expect.arrayContaining([
        { email: 'bo@example.com', role: 'owner', appRoles: ['support', 'manager', 'sales', 'accountant'] },
        { email: 'sanne@example.com', role: 'member', appRoles: ['sales'] },
      ]) },
      { id: '2', name: 'Globex', slug: 'globex', members: [{ email: 'root@example.com', role: 'owner', appRoles: ['support', 'manager', 'sales', 'accountant'] }] },
      // The default organization, which turning organizations on made, only stands in while they are off: nobody owns it.
      { id: 'default', name: 'Default', slug: 'default', members: [] },
    ])
    await expect(addMember(auth, { organization: 'acme', email: 'ana@example.com', appRoles: ['admin'] })).rejects.toThrow('A member cannot hold "admin"')
    await expect(createOrganization(auth, { name: 'Acme again', slug: 'acme', owner: 'bo@example.com' })).rejects.toThrow('exists already')
  })

  it("read and change one organization's people only, when kept to it", async () => {
    const { auth } = await serve({}, { people: true })
    expect((await listOrganizations(auth, '2')).organizations).toEqual([
      { id: '2', name: 'Globex', slug: 'globex', members: [{ email: 'root@example.com', role: 'owner', appRoles: ['support', 'manager', 'sales', 'accountant'] }] },
    ])
    expect((await listUsers(auth, { scope: '1' })).users.map(({ email }) => email)).toEqual(['bo@example.com', 'sanne@example.com'])
    expect((await listUsers(auth, { scope: everyOrganization('the test reads every organization') })).users).toHaveLength(4)
    expect([await isMemberByEmail(auth, '1', 'sanne@example.com'), await isMemberByEmail(auth, '2', 'sanne@example.com'), await isMemberByEmail(auth, '1', 'nobody@example.com')]).toEqual([true, false, false])
    await addMember(auth, { organization: 'globex', email: 'sanne@example.com', role: 'owner' })
    await setMemberRoles(auth, { organization: 'globex', email: 'sanne@example.com', appRoles: ['sales'] })
    // Only Globex's owners get the role: root, and Sanne, who lacked it.
    expect(await addAppRoleToOwners(auth, '2', 'manager')).toBe(1)
    await removeMember(auth, { organization: 'globex', email: 'sanne@example.com' })
    await expect(setMemberRoles(auth, { organization: 'globex', email: 'root@example.com', role: 'member' })).rejects.toThrow('Cannot demote the last owner')
    expect((await listOrganizations(auth, everyOrganization('the test reads every organization'))).organizations.map(({ slug, members }) => [slug, members.map(({ email, appRoles }) => `${email}:${appRoles.length}`)])).toEqual([
      ['acme', ['bo@example.com:4', 'sanne@example.com:1']],
      ['globex', ['root@example.com:4']],
      ['default', []],
    ])
  })
})

describe('the first user', () => {
  it('owns, with every app role, the organizations made before anyone, such as by a seed, but not the default one', async () => {
    const { auth, store } = await serve()
    await store.exec(`insert into organization (id, name, slug, created_at) values ('1', 'Seeded', 'seeded', now())`)
    await createUser(auth, { email: 'root@example.com', password })
    await createUser(auth, { email: 'bo@example.com', password })
    expect((await listOrganizations(auth, everyOrganization('the test reads every organization'))).organizations).toEqual([
      { id: 'default', name: 'Default', slug: 'default', members: [] },
      { id: '1', name: 'Seeded', slug: 'seeded', members: [{ email: 'root@example.com', role: 'owner', appRoles: ['support', 'manager', 'sales', 'accountant'] }] },
    ])
  })

  it('starts in no organization on a fresh store, so they name their first one', async () => {
    const app = await serve()
    await createUser(app.auth, { email: 'root@example.com', password })
    expect((await listOrganizations(app.auth, everyOrganization('the test reads every organization'))).organizations).toEqual([{ id: 'default', name: 'Default', slug: 'default', members: [] }])
    expect(await claimsOf(app, await app.signIn('root@example.com'))).not.toHaveProperty('org')
  })
})

describe('the organization a new session starts in', () => {
  it('is the default organization for a member whose only membership is there, as after turning organizations on', async () => {
    const app = await serve({}, { people: true })
    await addMember(app.auth, { organization: 'default', email: 'ana@example.com' })
    expect(await claimsOf(app, await app.signIn('ana@example.com'))).toMatchObject({ org: 'default' })
  })
})

describe('deleting an organization', () => {
  it('is refused while it has records, and done once it has none', async () => {
    const app = await serve({}, { people: true })
    const bo = await app.signIn('bo@example.com')
    const refused = await app.request('/api/auth/organization/delete', { cookie: bo, body: { organizationId: '1' } })
    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ code: 'ORGANIZATION_HAS_RECORDS', message: expect.stringContaining('companies') })
    await createOrganization(app.auth, { name: 'Empty', slug: 'empty', owner: 'bo@example.com' })
    expect((await app.request('/api/auth/organization/delete', { cookie: bo, body: { organizationId: '3' } })).status).toBe(200)
    expect((await listOrganizations(app.auth, everyOrganization('the test reads every organization'))).organizations.map((organization) => organization.slug)).toEqual(['acme', 'globex', 'default'])
  })
})

describe('creating an organization by its name', () => {
  it('derives the slug from the name, adds a suffix when another has it, and names the app\'s word in the status', async () => {
    const names = { singular: 'Workspace', plural: 'Workspaces' }
    const ids = ['3', '4']
    const app = await serve({ organizations: { default: { id: 'default', name: 'Default', slug: 'default' }, generateId: () => ids.shift()!, create: 'everyone', names, createDescription: 'Where your team talks.' } }, { people: true })
    const bo = await app.signIn('bo@example.com')
    const fresh = await app.request('/api/auth/organization/create', { cookie: bo, body: { name: ' Initech  ' } })
    expect(await fresh.json()).toMatchObject({ id: '3', name: 'Initech', slug: 'initech' })
    const clash = await (await app.request('/api/auth/organization/create', { cookie: bo, body: { name: 'Acme' } })).json()
    expect(clash).toMatchObject({ id: '4', name: 'Acme', slug: expect.stringMatching(/^acme-[a-z0-9]{6}$/) })
    expect((await app.request('/api/auth/organization/create', { cookie: bo, body: { name: '  ' } })).status).toBe(400)
    expect((await (await app.request('/api/auth/status')).json()).organizations).toMatchObject({ create: 'everyone', names, createDescription: 'Where your team talks.' })
  })
})
