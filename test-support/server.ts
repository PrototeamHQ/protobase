import { f, resource } from '@protobase/schema'
import { createHmac } from 'node:crypto'
import { openSnapshotDb } from './sql-snapshot'
import { createAdmin, jwtAuthenticator, type AdminOptions, type PipelineHook } from '@protobase/server'

export const organizations = resource('organizations')
  .table('organizations')
  .fields({ id: f.integer().readOnly().filterable().sortable(), name: f.text() })
  .primaryKey((r) => r.id)

export const companies = resource('companies')
  .table('companies')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    organizationId: f.relation('organizations').filterable(),
    name: f.text().filterable().sortable().min(1),
    status: f.enum(['open', 'won', 'lost']).default('open').filterable().sortable(),
    revenue: f.decimal({ precision: 10, scale: 2 }).default('0').filterable().sortable(),
    notes: f.text().optional(),
    meta: f.json().optional(),
    createdAt: f.timestamp().readOnly().filterable().sortable(),
    updatedAt: f.timestamp().readOnly(),
    deletedAt: f.timestamp().optional().readOnly(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .softDelete((r) => r.deletedAt)
  .search((r) => [r.name])
  .access({
    delete: (ctx) => (ctx.user as { roles: string[] }).roles.includes('admin'),
    list: ((ctx: { user: { roles: string[] } }) => (ctx.user.roles.includes('sales') ? 'status = "open"' : true)) as never,
  })
  .validate((record) => (record.name === 'forbidden' ? [{ field: 'name', message: 'That name is not allowed' }] : undefined))

/** No updated_at or version column: its ETags hash the row. */
export const labels = resource('labels')
  .table('labels')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    organizationId: f.relation('organizations').filterable(),
    name: f.text().filterable(),
    color: f.text().optional(),
    code: f.text().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .access({
    create: ((ctx: { user: { roles: string[] } }) => (ctx.user.roles.includes('restricted') ? 'regex(name, "^ok-")' : true)) as never,
    update: ((ctx: { user: { roles: string[] } }) => (ctx.user.roles.includes('restricted') ? 'regex(name, "^ok-")' : true)) as never,
  })

export const lineItems = resource('lineItems')
  .table('line_items')
  .fields({
    labelId: f.relation('labels').filterable().sortable(),
    lineNo: f.integer().sortable(),
    organizationId: f.relation('organizations').filterable(),
    quantity: f.integer(),
  })
  .primaryKey((r) => [r.labelId, r.lineNo])
  .tenant((r) => r.organizationId)

/** 30k rows, nothing indexed but the key: a filter on `kind` scans. */
export const events = resource('events')
  .table('events')
  .fields({ id: f.integer().readOnly().filterable().sortable(), kind: f.text().filterable(), at: f.timestamp().filterable().sortable() })
  .primaryKey((r) => r.id)

export const allResources = [organizations, companies, labels, lineItems, events]

/** A snapshot database of the fixture: two organizations, 3.5k companies, labels, line items and 30k events. */
export const createFixtureDb = async () => {
  const pg = await openSnapshotDb('fixture')
  return { pg, db: pg.db }
}

type Fixture = Awaited<ReturnType<typeof createFixtureDb>>

const testSecret = new TextEncoder().encode('test-signing-secret-test-signing-secret')

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url')

/** A real HS256 bearer token, signed synchronously so `as()` can stay a plain function. */
export const signTestToken = (claims: Record<string, unknown>, expiresInSeconds = 300) => {
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64url(JSON.stringify({ sub: 'tester', iat: now, exp: now + expiresInSeconds, ...claims }))}`
  return `${unsigned}.${base64url(createHmac('sha256', testSecret).update(unsigned).digest())}`
}

/** Verifies the tokens `signTestToken` makes; the tenant and roles come from their claims. */
export const testAuthenticator = jwtAuthenticator({ keys: async () => testSecret, algorithms: ['HS256'] })

/** An admin over the fixture database; every request needs the bearer token that `as()` makes. */
export const createTestApp = (fixture: Fixture, options: AdminOptions = {}, hooks: PipelineHook[] = []) =>
  createAdmin({
    resources: allResources,
    db: fixture.db,
    authenticate: testAuthenticator,
    options: { ...options, writeHooks: hooks },
  })

export type TestApp = ReturnType<typeof createTestApp>

/** Request headers for a caller in organization `org` (none for `undefined`) with these comma separated roles. */
export const as = (org: number | undefined, roles = 'admin', init: Record<string, string> = {}) => ({
  authorization: `Bearer ${signTestToken({ roles: roles.split(',').filter(Boolean), ...(org !== undefined && { tenant: org }) })}`,
  ...init,
})

export const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
})
