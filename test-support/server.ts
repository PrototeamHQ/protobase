import { PGlite } from '@electric-sql/pglite'
import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { f, resource } from '@protobase/schema'
import { createHmac } from 'node:crypto'
import { fromSnapshot } from './pglite-snapshot'
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

const ddl = `
create table organizations (id integer generated always as identity primary key, name text not null);
insert into organizations (name) values ('Acme'), ('Globex');

create table companies (
  id integer generated always as identity primary key,
  organization_id integer not null references organizations (id),
  name text not null, status text not null default 'open', revenue numeric(10,2) not null default 0,
  notes text, meta jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index on companies (organization_id, id);
insert into companies (organization_id, name, status, revenue, created_at)
select case when i <= 3000 then 1 else 2 end, 'Company ' || i, (array['open','won','lost'])[1 + i % 3], i % 1000,
  timestamptz '2026-01-01 00:00:00+00' + (i % 200) * interval '1 day'
from generate_series(1, 3500) i;
update companies set deleted_at = now() where id % 100 = 0;

create table labels (id integer generated always as identity primary key, organization_id integer not null, name text not null, color text, code text not null default md5(random()::text));
insert into labels (organization_id, name, color) values (1, 'urgent', 'red'), (1, 'later', null), (2, 'other-org', 'blue');

create table line_items (
  label_id integer not null, line_no integer not null, organization_id integer not null, quantity integer not null,
  primary key (label_id, line_no)
);
insert into line_items values (1, 1, 1, 5), (1, 2, 1, 7), (3, 1, 2, 9);

create table events (id integer generated always as identity primary key, kind text not null, at timestamptz not null);
insert into events (kind, at) select 'k' || (i % 50), timestamptz '2026-01-01+00' + i * interval '1 minute' from generate_series(1, 30000) i;
analyze;
`

export const buildFixturePg = async () => {
  const pg = new PGlite()
  await pg.exec(ddl)
  return pg
}

export const createFixtureDb = async () => {
  const pg = await fromSnapshot('server', buildFixturePg)
  return { pg, db: new Kysely<any>({ dialect: new PGliteDialect(pg) }) }
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
