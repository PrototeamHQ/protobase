import { Kysely, PostgresDialect, sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import type { Authenticator } from '../src/types'
import { readDefinitionsVersion } from '../src/user-tables/definitions-version'
import { reloadingAdmin } from '../src/user-tables/reloading-admin'
import { userTablesMigration } from '../src/user-tables/schema'
import { userTableResources } from '../src/user-tables/user-table-resources'
import { as, json, testAuthenticator } from '../../../test-support/server'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'

const ready = await postgresTemplateReady('empty')

const orders = resource('orders').table('orders').fields({ id: f.integer().readOnly(), amount: f.integer() }).primaryKey((r) => r.id)

// The app's authenticator puts on the session the organization role it read from the member row for this request; here
// the request names it, so a test changes it between two requests as a demotion would.
const withOrganizationRole: Authenticator = async (request) => {
  const session = await testAuthenticator(request)
  const role = request.headers.get('x-organization-role') as 'owner' | 'admin' | 'member' | null
  return session.tenant === undefined ? session : { ...session, organization: { id: session.tenant, ...(role && { role }) } }
}

let database: PostgresDatabase
let db: Kysely<any>
let app: ReturnType<typeof reloadingAdmin>
beforeAll(async () => {
  if (!ready) return
  database = await openPostgresDatabase('empty')
  await database.exec((await userTablesMigration(database.db))!)
  await database.exec('create table orders (id integer generated always as identity primary key, amount integer not null)')
  db = new Kysely<any>({ dialect: new PostgresDialect({ pool: database.pool({ max: 3 }) }) })
  const build = (tables: Awaited<ReturnType<typeof userTableResources>>) => createAdmin({ resources: [orders], userTables: { ...tables, organizations: true }, db, authenticate: withOrganizationRole })
  app = reloadingAdmin({ first: build(await userTableResources(db)), version: await readDefinitionsVersion(db), readVersion: () => readDefinitionsVersion(db), readTables: () => userTableResources(db), build })
})
afterAll(async () => {
  if (!ready) return
  await db.destroy()
  await database.close()
})

// A caller working in organization `org` with that organization role there (none for someone who is no member) and
// these app roles.
type Caller = { org?: number; role?: 'owner' | 'admin' | 'member'; roles?: string }
const call = (caller: Caller, path: string, init: RequestInit = {}) =>
  app.request(path, { ...init, headers: { ...as(caller.org, caller.roles ?? '', caller.role ? { 'x-organization-role': caller.role } : {}), ...(init.headers as Record<string, string>) } })
const adminOfA: Caller = { org: 1, role: 'admin' }
const ownerOfB: Caller = { org: 2, role: 'owner' }

const rows = async <T>(query: string) => (await sql.raw<T>(query).execute(database.db)).rows
const createTable = (caller: Caller, name: string) =>
  call(caller, '/api/v1:batchWrite', json({
    ops: [
      { op: 'create', resource: 'user_tables', ref: 't', data: { name, singular_label: 'Contact', plural_label: 'Contacts' } },
      { op: 'create', resource: 'user_table_fields', data: { table_id: { $ref: 't' }, name: 'name', label: 'Name', type: 'text', position: 1 } },
      { op: 'update', resource: 'user_tables', key: { $ref: 't' }, etag: '*', data: { title_field: 'name' } },
    ],
  }))
const patch = (caller: Caller, path: string, body: unknown) =>
  call(caller, path, { method: 'PATCH', headers: { 'content-type': 'application/json', 'if-match': '*' }, body: JSON.stringify(body) })
const metaNames = async (caller: Caller) => ((await (await call(caller, '/api/meta')).json()) as { resources: { name: string }[] }).resources.map((model) => model.name)
const documented = async (caller: Caller) => Object.keys(((await (await call(caller, '/api/openapi.json')).json()) as { paths: Record<string, unknown> }).paths).join(' ')

type Made = { id: string; table: string }
let a: Made
let b: Made
let recordOfA: string

describe.skipIf(!ready)('tables users add in an app with organizations', () => {
  it('lets the admins of two organizations each make a table of one name, each its own t<id>_<name>', async () => {
    const made = async (caller: Caller) => {
      const response = await createTable(caller, 'contacts')
      expect(response.status).toBe(200)
      const id = String(((await response.json()) as { results: { record: { id: string } }[] }).results[0]!.record.id)
      return { id, table: `t${id}_contacts` }
    }
    a = await made(adminOfA)
    b = await made(ownerOfB)
    expect(a.table).not.toBe(b.table)
    expect(await rows(`select name, organization_id, table_name from table_definitions.tables order by id`)).toEqual([
      { name: 'contacts', organization_id: '1', table_name: a.table },
      { name: 'contacts', organization_id: '2', table_name: b.table },
    ])
    expect((await rows<{ organization_id: string }>(`select distinct organization_id from table_definitions.fields order by 1`)).map((row) => row.organization_id)).toEqual(['1', '2'])
  })

  it('gives no database role but its owner a grant on a new table', async () => {
    expect(await rows(`select relacl from pg_class where oid = 'user_tables.${a.table}'::regclass`)).toEqual([{ relacl: null }])
  })

  it("refuses a record whose body names an organization, and keeps one in the caller's organization", async () => {
    expect((await call(adminOfA, `/api/v1/${a.table}`, json({ name: 'Ann Smith', organization_id: '2' }))).status).toBe(400)
    expect((await call(adminOfA, `/api/v1/${a.table}`, json({ name: 'Ann Smith' }))).status).toBe(201)
    const stored = await rows<{ id: string; organization_id: string }>(`select id::text, organization_id from user_tables.${a.table}`)
    expect(stored.map((row) => row.organization_id)).toEqual(['1'])
    recordOfA = stored[0]!.id
    expect(await rows(`select * from user_tables.${b.table}`)).toEqual([])
  })

  it("answers not found to another organization's admins, at the table, its records and its definition", async () => {
    for (const path of [`/api/v1/${a.table}`, `/api/v1/${a.table}/${recordOfA}`, `/api/v1/${a.table}?filter=${encodeURIComponent('search("Ann")')}`]) {
      const response = await call(ownerOfB, path)
      expect(response.status).toBe(404)
      expect(await response.text()).not.toContain('Ann')
    }
    expect((await patch(ownerOfB, `/api/v1/${a.table}/${recordOfA}`, { name: 'Taken' })).status).toBe(404)
    expect((await call(ownerOfB, `/api/v1/${a.table}/${recordOfA}`, { method: 'DELETE', headers: { 'if-match': '*' } })).status).toBe(404)
    expect(await rows(`select name from user_tables.${a.table}`)).toEqual([{ name: 'Ann Smith' }])

    expect((await call(ownerOfB, `/api/v1/user_tables/${a.id}`)).status).toBe(404)
    expect((await patch(ownerOfB, `/api/v1/user_tables/${a.id}`, { plural_label: 'Taken' })).status).toBe(404)
    expect((await call(ownerOfB, `/api/v1/user_table_fields/${a.id},name`)).status).toBe(404)
    const added = await call(ownerOfB, '/api/v1/user_table_fields', json({ table_id: Number(a.id), name: 'planted', label: 'Planted', type: 'text', position: 2 }))
    expect(added.status).toBeGreaterThanOrEqual(400)
    expect(added.status).toBeLessThan(500)
    expect(await rows(`select plural_label from table_definitions.tables where id = ${a.id}`)).toEqual([{ plural_label: 'Contacts' }])
    expect(await rows(`select name from table_definitions.fields where table_id = ${a.id}`)).toEqual([{ name: 'name' }])
    const listed = (await (await call(ownerOfB, '/api/v1/user_tables')).json()) as { items: { id: string }[] }
    expect(listed.items.map((item) => String(item.id))).toEqual([b.id])
  })

  it("names another organization's table nowhere: not in /meta, nor in the API document", async () => {
    expect(await metaNames(ownerOfB)).toContain(b.table)
    expect(await metaNames(ownerOfB)).not.toContain(a.table)
    expect(await documented(ownerOfB)).not.toContain(a.table)
    expect(await metaNames(adminOfA)).toContain(a.table)
    expect(await metaNames(adminOfA)).not.toContain(b.table)
  })

  it('shows a plain member nothing and lets them make no table, and reads a demotion on the next request', async () => {
    const member: Caller = { org: 1, role: 'member', roles: 'sales' }
    expect((await call(member, `/api/v1/${a.table}`)).status).toBe(404)
    expect(await metaNames(member)).not.toContain(a.table)
    expect((await createTable(member, 'planted')).status).toBe(404)
    expect(await rows(`select name from table_definitions.tables where name = 'planted'`)).toEqual([])
    expect((await call({ org: 1, role: 'admin' }, `/api/v1/${a.table}`)).status).toBe(200)
    expect((await call({ org: 1, role: 'member' }, `/api/v1/${a.table}`)).status).toBe(404)
  })

  it('shows someone in both organizations only the one they work in', async () => {
    const records = async (caller: Caller, table: string) => ((await (await call(caller, `/api/v1/${table}`)).json()) as { items: { name: string }[] }).items.map((item) => item.name)
    expect(await records({ org: 1, role: 'admin' }, a.table)).toEqual(['Ann Smith'])
    expect((await call({ org: 2, role: 'admin' }, `/api/v1/${a.table}`)).status).toBe(404)
    expect((await call({ org: 2, role: 'admin' }, `/api/v1/${b.table}`, json({ name: 'Bo' }))).status).toBe(201)
    expect(await rows(`select organization_id from user_tables.${b.table}`)).toEqual([{ organization_id: '2' }])
    expect(await records({ org: 1, role: 'admin' }, a.table)).toEqual(['Ann Smith'])
  })

  it('lets a superuser in only where they work, and no one working in no organization, nor anyone without a token', async () => {
    expect((await call({ org: 1, roles: 'admin' }, `/api/v1/${a.table}`)).status).toBe(200)
    expect((await call({ org: 2, roles: 'admin' }, `/api/v1/${a.table}`)).status).toBe(404)
    const nowhere: Caller = { roles: 'admin' }
    for (const table of [a.table, b.table]) expect((await call(nowhere, `/api/v1/${table}`)).status).toBe(404)
    const seen = await metaNames(nowhere)
    expect(seen).not.toContain(a.table)
    expect(seen).not.toContain(b.table)
    expect((await call(nowhere, '/api/v1/user_tables')).status).toBe(404)
    const anonymous = await app.request(`/api/v1/${a.table}`)
    expect([401, 404]).toContain(anonymous.status)
    expect(await anonymous.text()).not.toContain('Ann')
  })
})

// The definitions schema as the release before organizations made it.
const beforeOrganizations = `
  create extension if not exists pg_trgm;
  create schema table_definitions;
  create schema user_tables;
  create table table_definitions.tables (
    id bigint generated always as identity primary key,
    name text not null unique check (name ~ '^[a-z][a-z0-9_]*$' and octet_length(name) <= 63),
    singular_label text not null,
    plural_label text not null,
    title_field text check (title_field ~ '^[a-z][a-z0-9_]*$' and octet_length(title_field) <= 63),
    version bigint not null default 1 check (version > 0)
  );
  create table table_definitions.fields (
    table_id bigint not null references table_definitions.tables (id) on delete cascade,
    name text not null check (name ~ '^[a-z][a-z0-9_]*$' and octet_length(name) <= 63) check (name not in ('id', 'etag')),
    label text not null,
    type text not null check (type in ('text', 'long_text', 'integer', 'decimal', 'boolean', 'date', 'timestamp', 'json')),
    required boolean not null,
    position integer not null,
    precision integer check (precision between 1 and 1000),
    scale integer check (scale between 0 and precision),
    primary key (table_id, name),
    check ((type = 'decimal') = (precision is not null and scale is not null))
  );
  create table user_tables.notes (id bigint generated always as identity primary key, title text);
  insert into table_definitions.tables (name, singular_label, plural_label) values ('notes', 'Note', 'Notes');
  insert into table_definitions.fields (table_id, name, label, type, required, position) values (1, 'title', 'Title', 'text', false, 1);
`

describe.skipIf(!ready)('the migration of a definitions schema made before organizations', () => {
  it('keeps its definitions served under their names, and ties each field to its table', async () => {
    const old = await openPostgresDatabase('empty')
    await old.exec(beforeOrganizations)
    const migration = (await userTablesMigration(old.db))!
    expect(migration).toContain('drop constraint tables_name_key')
    await old.exec(migration)
    expect(await userTablesMigration(old.db)).toBeUndefined()
    const served = await userTableResources(old.db)
    expect(served.problems).toEqual([])
    expect(served.resources.map((source) => source.toModel().name)).toEqual(['notes'])
    expect((await sql.raw(`select table_name, tenant_key from table_definitions.tables`).execute(old.db)).rows).toEqual([{ table_name: 'notes', tenant_key: '-' }])
    await expect(old.exec(`insert into table_definitions.tables (name, organization_id, singular_label, plural_label) values ('notes', 'a', 'Note', 'Notes')`)).resolves.toBeUndefined()
    await expect(old.exec(`insert into table_definitions.fields (table_id, organization_id, name, label, type, required, position) values (1, 'a', 'planted', 'Planted', 'text', false, 2)`)).rejects.toThrow(/foreign key/)
  })
})
