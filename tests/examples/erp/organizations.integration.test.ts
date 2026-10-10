import { decodeJwt } from 'jose'
import type pg from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { addMember, configExports, createAdmin, createOrganization, createUser, listOrganizations } from '@protobase/server'
import * as config from '../../../examples/erp/config'
import { roles } from '../../../examples/erp/config/roles'
import { createDb } from '../../../examples/erp/db/kysely'
import { databaseReachable } from './reachable'

const reachable = await databaseReachable()
// The ERP's auth module reads its secret at import; the run's database comes from vitest.config.ts.
process.env.BETTER_AUTH_SECRET ??= 'organizations-test-secret-organizations-test'
const { auth, authenticate } = await import('../../../examples/erp/auth/auth')
const db = createDb(4)
afterAll(async () => {
  await db.destroy()
  await (globalThis as { __erpAdminPool?: pg.Pool }).__erpAdminPool?.end()
})

const origin = 'http://localhost:5173'
const password = 'correct horse battery'
const { resources, views } = configExports(config)
const app = createAdmin({ resources, views, db, authenticate, auth, options: { roles } })

// Better Auth limits sign-ins per client address; the test is one client.
const address = '192.0.2.10'
const request = (path: string, init: { body?: unknown; cookie?: string; token?: string } = {}) =>
  app.request(`${origin}${path}`, {
    method: init.body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': address, ...(init.cookie && { cookie: init.cookie }), ...(init.token && { authorization: `Bearer ${init.token}` }) },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  })
const signIn = async (email: string) => {
  const response = await request('/api/auth/sign-in/email', { body: { email, password } })
  expect(response.status).toBe(200)
  return response.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
}
const tokenOf = async (cookie: string) => ((await (await request('/api/auth/token', { cookie })).json()) as { token: string }).token
const organizationsOf = async (token: string, resource: string) => {
  const list = (await (await request(`/api/v1/${resource}?page_size=200`, { token })).json()) as { items: { organizationId: number }[] }
  expect(list.items.length).toBeGreaterThan(0)
  return new Set(list.items.map((item) => item.organizationId))
}

// The seeded ERP has two organizations, 1 and 2, each with its own records, in its tables and the auth schema's.
describe.skipIf(!reachable)('the ERP with two organizations', () => {
  it('shows each person only the rows of the organization they work in, and switching changes them', async () => {
    // The first user owns the seeded organizations
    await createUser(auth, { email: 'root@erp.example', password })
    expect((await listOrganizations(auth)).map((organization) => [organization.slug, organization.members.map((member) => member.role)])).toEqual([['rijnland', ['owner']], ['nordlicht', ['owner']]])
    await createUser(auth, { email: 'sanne@rijnland.example', password, role: 'user' })
    await createUser(auth, { email: 'katrin@nordlicht.example', password, role: 'user' })
    await createUser(auth, { email: 'eva@both.example', password, role: 'user' })
    await addMember(auth, { organization: 'rijnland', email: 'sanne@rijnland.example', role: 'admin', appRoles: ['manager'] })
    await addMember(auth, { organization: 'nordlicht', email: 'katrin@nordlicht.example', role: 'admin', appRoles: ['manager'] })
    await addMember(auth, { organization: 'rijnland', email: 'eva@both.example', appRoles: ['sales'] })
    await addMember(auth, { organization: 'nordlicht', email: 'eva@both.example', appRoles: ['sales'] })

    const sanne = await tokenOf(await signIn('sanne@rijnland.example'))
    const katrin = await tokenOf(await signIn('katrin@nordlicht.example'))
    expect(await organizationsOf(sanne, 'products')).toEqual(new Set([1]))
    expect(await organizationsOf(katrin, 'products')).toEqual(new Set([2]))
    expect(await organizationsOf(sanne, 'invoices')).toEqual(new Set([1]))
    expect(await organizationsOf(katrin, 'invoices')).toEqual(new Set([2]))

    // Eva starts in her oldest membership, then works in the other one
    const eva = await signIn('eva@both.example')
    expect(decodeJwt(await tokenOf(eva))).toMatchObject({ org: '1', org_role: 'member', app_roles: ['sales'] })
    expect(await organizationsOf(await tokenOf(eva), 'companies')).toEqual(new Set([1]))
    expect((await request('/api/auth/organization/switch', { cookie: eva, body: { organizationId: '2' } })).status).toBe(200)
    expect(await organizationsOf(await tokenOf(eva), 'companies')).toEqual(new Set([2]))
    // A record of the other organization is not there for her
    const rijnlandCompany = (await (await request('/api/v1/companies?page_size=1', { token: sanne })).json()).items[0].id
    expect((await request(`/api/v1/companies/${rijnlandCompany}`, { token: await tokenOf(eva) })).status).toBe(404)
  })

  it('gives a new organization the next id of the ERP and its own row there', async () => {
    const { organization } = await createOrganization(auth, { name: 'Zuidwind Trading', slug: 'zuidwind', owner: 'root@erp.example' })
    expect(Number(organization.id)).toBeGreaterThan(2)
    const row = (await db.selectFrom('core.organizations').select(['name', 'slug', 'country_code']).where('id', '=', Number(organization.id)).executeTakeFirst())!
    expect(row).toEqual({ name: 'Zuidwind Trading', slug: 'zuidwind', country_code: 'NL' })
    expect((await listOrganizations(auth)).map((entry) => entry.slug)).toEqual(['rijnland', 'nordlicht', 'zuidwind'])
  })
})
