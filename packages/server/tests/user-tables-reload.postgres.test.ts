import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { defineRoles, f, resource } from '@protobase/schema'
import { createAdmin } from '../src/create-admin'
import { readDefinitionsVersion } from '../src/user-tables/definitions-version'
import { reloadingAdmin } from '../src/user-tables/reloading-admin'
import { userTablesMigration } from '../src/user-tables/schema'
import { userTableResources } from '../src/user-tables/user-table-resources'
import { as, json, testAuthenticator } from '../../../test-support/server'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'

const ready = await postgresTemplateReady('empty')

const orders = resource('orders').table('orders').fields({ id: f.integer().readOnly(), amount: f.integer() }).primaryKey((r) => r.id)
const roles = defineRoles({ admin: ['*'] })

// A serving process: its own pool, and the admin it builds at startup from the definitions then.
const serving = async (url: string) => {
  const pool = new pg.Pool({ connectionString: url, max: 2 })
  const db = new Kysely<any>({ dialect: new PostgresDialect({ pool }) })
  const build = (tables: Awaited<ReturnType<typeof userTableResources>>) => createAdmin({ resources: [orders], userTables: tables, db, authenticate: testAuthenticator, options: { roles } })
  const version = await readDefinitionsVersion(db)
  const admin = reloadingAdmin({ first: build(await userTableResources(db)), version, readVersion: () => readDefinitionsVersion(db), readTables: () => userTableResources(db), build })
  const call = (path: string, init: RequestInit = {}) => admin.request(path, { ...init, headers: { ...as(1, 'admin'), ...(init.headers as Record<string, string>) } })
  return { admin, call, close: () => db.destroy() }
}

let database: PostgresDatabase
let one: Awaited<ReturnType<typeof serving>>
let two: Awaited<ReturnType<typeof serving>>
beforeAll(async () => {
  if (!ready) return
  database = await openPostgresDatabase('empty')
  await database.exec((await userTablesMigration(database.db))!)
  await database.exec('create table orders (id integer generated always as identity primary key, amount integer not null)')
  one = await serving(database.url)
  two = await serving(database.url)
})
afterAll(async () => {
  if (!ready) return
  await one.close()
  await two.close()
  await database.close()
})

const names = async (call: typeof one.call) => ((await (await call('/api/meta')).json()) as { resources: { name: string }[] }).resources.map((model) => model.name)

describe.skipIf(!ready)('a definition added while two processes serve', () => {
  it('is served by the other process on its next /meta, and at once on a request that names it', async () => {
    expect(await names(two.call)).toEqual(['orders'])
    // What creating a table will do, written directly; the process that wrote it reloads at once.
    await database.exec(`
      create table user_tables.notes (id bigint generated always as identity primary key, title text not null);
      insert into table_definitions.tables (name, singular_label, plural_label, title_field, version) values ('notes', 'Note', 'Notes', 'title', 1);
      insert into table_definitions.fields (table_id, name, label, type, required, position) values (1, 'title', 'Title', 'text', true, 1);`)
    await one.admin.reload()
    expect(await names(one.call)).toEqual(['orders', 'notes'])
    // Within the second since the other process last read the version.
    const created = await two.call('/api/v1/notes', json({ title: 'First' }))
    expect(created.status).toBe(201)
    expect(await names(two.call)).toEqual(['orders', 'notes'])
  })

  it('takes a field added to a definition on a write that names it, rather than refusing it', async () => {
    await database.exec(`
      alter table user_tables.notes add column body text;
      insert into table_definitions.fields (table_id, name, label, type, required, position) values (1, 'body', 'Body', 'long_text', false, 2);
      update table_definitions.tables set version = version + 1 where name = 'notes';`)
    const created = await one.call('/api/v1/notes', json({ title: 'Second', body: 'More' }))
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({ title: 'Second', body: 'More' })
  })

  it('stops serving a definition removed, after the next /meta', async () => {
    await database.exec(`delete from table_definitions.tables where name = 'notes'`)
    expect(await names(two.call)).toEqual(['orders'])
    expect((await two.call('/api/v1/notes')).status).toBe(404)
  })
})
