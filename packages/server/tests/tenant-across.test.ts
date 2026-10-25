import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { createFixtureDb, labels, organizations, signTestToken, testAuthenticator } from '../../../test-support/server'
import { createAdmin } from '../src/create-admin'
import type { Authenticator, Membership } from '../src/types'

// The fixture's companies, listed across the organizations someone is a member of: a seller lists the open ones, a
// viewer reads no revenue, and a guest lists nothing.
const companies = resource('companies')
  .table('companies')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    organizationId: f.relation('organizations').filterable(),
    name: f.text().filterable().sortable(),
    status: f.enum(['open', 'won', 'lost']).filterable().sortable(),
    revenue: f.decimal({ precision: 10, scale: 2 }).access({ read: ((ctx: { user: { roles: string[] } }) => !ctx.user.roles.includes('viewer')) as never }),
    deletedAt: f.timestamp().optional().readOnly(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId, { across: 'memberships' })
  .softDelete((r) => r.deletedAt)
  .access({ list: ((ctx: { user: { roles: string[] } }) => (ctx.user.roles.includes('guest') ? false : ctx.user.roles.includes('sales') ? 'status = "open"' : true)) as never })

// The test tokens carry the memberships the store would answer, so each test says who is a member of what.
const authenticate: Authenticator = async (request) => {
  const session = await testAuthenticator(request)
  const token = request.headers.get('authorization')!.split(' ')[1]!
  const { memberships } = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { memberships?: Membership[] }
  return memberships ? { ...session, memberships: async () => memberships } : session
}

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
let app: ReturnType<typeof createAdmin>
beforeAll(async () => {
  fixture = await createFixtureDb()
  app = createAdmin({ resources: [organizations, companies, labels], db: fixture.db, authenticate })
})
afterAll(async () => { await fixture.db.destroy() })

const as = (org: number, roles: string, memberships?: Membership[]) => ({ authorization: `Bearer ${signTestToken({ roles: [roles], tenant: org, ...(memberships && { memberships }) })}` })

const list = async (path: string, headers: Record<string, string>) => {
  const response = await app.request(`/api/v1${path}`, { headers })
  expect(response.status).toBe(200)
  return response.json()
}

const total = async (headers: Record<string, string>, filter?: string) =>
  (await list(`/companies?page_size=1&count=exact${filter ? `&filter=${encodeURIComponent(filter)}` : ''}`, headers)).total_size as number

// The live companies of each organization, as a member who works there lists them
const acme = 2970
const globex = 495

describe('a list across organizations', () => {
  it('reads every organization the person is a member of, and no other', async () => {
    expect(await total(as(1, 'admin', [{ tenant: 1, roles: ['admin'] }, { tenant: 2, roles: ['admin'] }]))).toBe(acme + globex)
    expect(await total(as(1, 'admin', [{ tenant: 1, roles: ['admin'] }]))).toBe(acme)
    expect(await total(as(1, 'admin'))).toBe(acme)
    expect(await total(as(1, 'admin', [{ tenant: 1, roles: ['admin'] }]), 'organizationId = 2')).toBe(0)
    expect(await total(as(2, 'admin', [{ tenant: 1, roles: ['admin'] }]))).toBe(acme + globex)
  })

  it('filters on the tenant field like any other', async () => {
    const both = as(1, 'admin', [{ tenant: 2, roles: ['admin'] }])
    expect(await total(both, 'organizationId = 2')).toBe(globex)
    const facets = await list('/companies:facets?field=organizationId', both)
    expect(Object.fromEntries(facets.facets.map((facet: { value: number; count: number }) => [facet.value, facet.count]))).toEqual({ 1: acme, 2: globex })
  })

  it("reads each organization with the person's role there", async () => {
    const openInGlobex = await total(as(2, 'sales'))
    const openInAcme = await total(as(1, 'sales'))
    expect(openInGlobex).toBeLessThan(globex)
    expect(await total(as(1, 'admin', [{ tenant: 2, roles: ['sales'] }]))).toBe(acme + openInGlobex)
    expect(await total(as(1, 'sales', [{ tenant: 2, roles: ['admin'] }]))).toBe(openInAcme + globex)
    const statuses = await list('/companies:facets?field=status&filter=organizationId%20%3D%202', as(1, 'admin', [{ tenant: 2, roles: ['sales'] }]))
    expect(statuses.facets.map((facet: { value: string }) => facet.value)).toEqual(['open'])
  })

  it('leaves out an organization where the role lists nothing, or reads fewer fields', async () => {
    expect(await total(as(1, 'admin', [{ tenant: 2, roles: ['guest'] }]))).toBe(acme)
    expect(await total(as(1, 'admin', [{ tenant: 2, roles: ['viewer'] }]))).toBe(acme)
    const asViewer = await list('/companies?page_size=5&filter=organizationId%20%3D%202', as(1, 'viewer', [{ tenant: 2, roles: ['admin'] }]))
    expect(asViewer.items).toHaveLength(5)
    expect(asViewer.items.every((item: Record<string, unknown>) => !('revenue' in item))).toBe(true)
  })

  it('keeps reads of one record and every write in the current organization', async () => {
    const member = as(1, 'admin', [{ tenant: 2, roles: ['admin'] }])
    expect((await app.request('/api/v1/companies/3401', { headers: member })).status).toBe(404)
    const etag = (await app.request('/api/v1/companies/3401', { headers: as(2, 'admin') })).headers.get('etag')!
    const json = { ...member, 'content-type': 'application/json' }
    expect((await app.request('/api/v1/companies/3401', { method: 'PATCH', body: JSON.stringify({ name: 'Moved' }), headers: { ...json, 'if-match': etag } })).status).toBe(404)
    expect((await app.request('/api/v1/companies/3401', { method: 'DELETE', headers: member })).status).toBe(404)
    const create = (body: Record<string, unknown>) => app.request('/api/v1/companies', { method: 'POST', body: JSON.stringify({ name: 'Initech', status: 'open', revenue: '0', ...body }), headers: json })
    expect((await create({ organizationId: 2 })).status).toBe(400)
    expect(await (await create({})).json()).toMatchObject({ organizationId: 1 })
    const rows = await list('/companies?page_size=500&fields=id,organizationId&order_by=id%20desc', member)
    const permissions = (org: number) => rows.items.filter((item: { organizationId: number }) => item.organizationId === org).map((item: { permissions: unknown }) => item.permissions)
    expect(new Set(permissions(2).map((value: unknown) => JSON.stringify(value)))).toEqual(new Set([JSON.stringify({ update: false, delete: false })]))
    expect(permissions(1).every((value: { update: boolean }) => value.update)).toBe(true)
  })

  it('leaves a resource without across in the current organization', async () => {
    const response = await list('/labels?page_size=500&count=exact', as(1, 'admin', [{ tenant: 2, roles: ['admin'] }]))
    expect(response.items.every((item: { organizationId: number }) => item.organizationId === 1)).toBe(true)
  })
})
