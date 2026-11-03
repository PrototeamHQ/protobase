import { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { defineRoles, f, resource } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { checkUserTablesSchema, userTablesMigration } from '../src/user-tables/schema'
import { userTableResources, type UserTables } from '../src/user-tables/user-table-resources'
import { as, json, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

// A resource in code, and a user table of the same name, which it wins over.
const orders = resource('orders').table('orders').fields({ id: f.integer().readOnly().filterable().sortable(), amount: f.integer() }).primaryKey((r) => r.id)
const roles = defineRoles({ admin: ['*'], reader: ['*.read'], editor: ['*.read', '*.create', '*.update', '*.delete'] })

let pg: SnapshotDb
let db: Kysely<any>
let tables: UserTables
let app: ReturnType<typeof createAdmin>
let migration: string | undefined
beforeAll(async () => {
  pg = await openSnapshotDb('empty')
  db = new Kysely({ dialect: pg.dialect })
  migration = await userTablesMigration(db)
  await pg.exec(migration!)
  await pg.exec(`
    create table orders (id integer generated always as identity primary key, amount integer not null);
    create table user_tables.notes (id bigint generated always as identity primary key, title text not null, body text);
    create index on user_tables.notes (title);
    create index on user_tables.notes using gin (title gin_trgm_ops);
    create table user_tables.tasks (id bigint generated always as identity primary key, title text not null);
    create table user_tables.orders (id bigint generated always as identity primary key, note text);
    insert into table_definitions.tables (name, singular_label, plural_label, title_field, version) values
      ('notes', 'Note', 'Notes', 'title', 1), ('tasks', 'Task', 'Tasks', 'title', 1), ('orders', 'Order', 'Orders', null, 1);
    insert into table_definitions.fields (table_id, name, label, type, required, position) values
      (1, 'title', 'Title', 'text', true, 1), (1, 'body', 'Body <b>bold</b>', 'long_text', false, 2),
      (2, 'title', 'Title', 'text', true, 1), (2, 'due', 'Due', 'date', false, 2),
      (3, 'note', 'Note', 'text', false, 1);
  `)
  tables = await userTableResources(db)
  app = createAdmin({ resources: [orders], userTables: tables, db, authenticate: testAuthenticator, options: { roles } })
})
afterAll(async () => {
  await db.destroy()
})

const call = (roles: string | undefined, path: string, init: RequestInit = {}) =>
  app.request(path.startsWith('/api/') ? path : `/api/v1${path}`, { ...init, headers: { ...(roles !== undefined && as(1, roles)), ...(init.headers as Record<string, string>) } })

describe('the migration of user tables', () => {
  it('adds the two schemas, their tables and pg_trgm, and nothing once the database is current', async () => {
    expect(migration).toContain('create schema if not exists table_definitions')
    expect(migration).toContain('create schema if not exists user_tables')
    expect(await userTablesMigration(db)).toBeUndefined()
    await expect(checkUserTablesSchema(db)).resolves.toBeUndefined()
  })
  it('refuses a definition whose name is no safe identifier, in the database too', async () => {
    await expect(pg.exec(`insert into table_definitions.tables (name, singular_label, plural_label, version) values ('Bad"name', 'Bad', 'Bad', 1)`)).rejects.toThrow(/violates check constraint/)
  })
})

describe('tables defined in the database', () => {
  it('leaves out a definition whose column is missing, and one whose name a resource in code has', () => {
    expect(tables.problems).toEqual(['The user table "tasks" is not served: the column "due" does not exist.'])
    expect(tables.resources.map((source) => source.toModel().name)).toEqual(['notes', 'orders'])
  })
  it('serves create, list, record and search of a definition to an admin, and the code resources beside it', async () => {
    const created = await call('admin', '/notes', json({ title: 'First note', body: 'Some <script>text</script>' }, as(1, 'admin')))
    expect(created.status).toBe(201)
    const listed = await (await call('admin', '/notes')).json()
    expect(listed.items.map((item: { title: string }) => item.title)).toEqual(['First note'])
    const record = await (await call('admin', `/notes/${listed.items[0].id}`)).json()
    expect(record).toMatchObject({ title: 'First note', body: 'Some <script>text</script>' })
    const found = await (await call('admin', `/notes?filter=${encodeURIComponent('search("first")')}`)).json()
    expect(found.items).toHaveLength(1)
    expect((await call('admin', '/orders')).status).toBe(200)
  })
  it('names it in /meta and the API document for an admin, with its labels, and the code resource of the same name', async () => {
    const meta = await (await call('admin', '/api/meta')).json()
    expect(meta.resources.map((model: { name: string }) => model.name)).toEqual(['orders', 'user_tables', 'user_table_fields', 'notes'])
    expect(Object.keys(meta.resources[0].fields)).toEqual(['id', 'amount'])
    const notesView = meta.views.find((shown: { resource: string }) => shown.resource === 'notes')
    expect(notesView).toMatchObject({ names: { singular: 'Note', plural: 'Notes' }, title: 'title', fields: { body: { label: 'Body <b>bold</b>', multiline: true } } })
    const document = await (await call('admin', '/api/openapi.json')).json()
    expect(Object.keys(document.paths)).toEqual(expect.arrayContaining(['/orders', '/notes', '/notes/{key}']))
  })
  it('refuses a filter and a sort no index serves', async () => {
    expect((await call('admin', `/notes?filter=${encodeURIComponent('body = "x"')}`)).status).toBe(400)
    expect((await call('admin', '/notes?order_by=body')).status).toBe(400)
    expect((await call('admin', '/notes?order_by=title')).status).toBe(200)
  })
  it('gives a role with wildcard grants nothing of it, answering 404 as for a resource it does not know: no list, record, search, write, /meta or API document entry', async () => {
    for (const role of ['reader', 'editor']) {
      for (const path of ['/notes', '/notes/1', `/notes?filter=${encodeURIComponent('search("first")')}`]) {
        const response = await call(role, path)
        // Not found, as for a resource the caller does not know of.
        expect(response.status, `${role} ${path}`).toBe(404)
        expect(await response.text()).not.toContain('First note')
      }
      expect((await call(role, '/notes', json({ title: 'Sneaky' }, as(1, role)))).status).toBe(404)
      expect((await call(role, '/notes/1', { method: 'PATCH', headers: { ...as(1, role), 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Changed' }) })).status).toBe(404)
      expect((await call(role, '/notes/1', { method: 'DELETE' })).status).toBe(404)
      const meta = await (await call(role, '/api/meta')).text()
      expect(meta).not.toContain('"notes"')
      expect(Object.keys((await (await call(role, '/api/openapi.json')).json()).paths).filter((path) => path.startsWith('/notes'))).toEqual([])
    }
    const titles = await (await call('admin', '/notes')).json()
    expect(titles.items.map((item: { title: string }) => item.title)).toEqual(['First note'])
  })
  it('answers an anonymous caller 401 on its list, record, /meta and API document, with nothing of it', async () => {
    for (const path of ['/notes', '/notes/1', '/api/meta', '/api/openapi.json']) {
      const response = await call(undefined, path)
      expect(response.status, path).toBe(401)
      const body = await response.text()
      expect(body).not.toContain('First note')
      expect(body).not.toContain('Body')
    }
  })
})
