import { Kysely, PostgresDialect, sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { defineRoles, f, resource } from '@protobase/schema'
import { reservedWords } from '@protobase/schema/internal'
import { createAdmin } from '../src/create-admin'
import type { ResourceSource } from '../src/resource-source'
import { readDefinitionsVersion } from '../src/user-tables/definitions-version'
import { reloadingAdmin } from '../src/user-tables/reloading-admin'
import { userTablesMigration } from '../src/user-tables/schema'
import { userTableResources } from '../src/user-tables/user-table-resources'
import { as, json, testAuthenticator } from '../../../test-support/server'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'

const ready = await postgresTemplateReady('empty')

const orders = resource('orders').table('orders').fields({ id: f.integer().readOnly(), amount: f.integer() }).primaryKey((r) => r.id)
const roles = defineRoles({
  admin: ['*'],
  fields_only: ['user_table_fields.create', 'user_table_fields.read', 'user_tables.read'],
  writer: ['*.read', '*.create', '*.update', '*.delete'],
  everything: ['*.*'],
  member: ['orders.read'],
})

// A serving process: its own pool, and the admin it builds from the definitions, rebuilt as they change.
const serving = async (pool = database.pool({ max: 3 }), resources: ResourceSource[] = [orders]) => {
  const db = new Kysely<any>({ dialect: new PostgresDialect({ pool }) })
  const build = (tables: Awaited<ReturnType<typeof userTableResources>>) => createAdmin({ resources, userTables: tables, db, authenticate: testAuthenticator, options: { roles } })
  const admin = reloadingAdmin({ first: build(await userTableResources(db)), version: await readDefinitionsVersion(db), readVersion: () => readDefinitionsVersion(db), readTables: () => userTableResources(db), build })
  const call = (path: string, init: RequestInit = {}, role = 'admin') => admin.request(path, { ...init, headers: { ...as(1, role), ...(init.headers as Record<string, string>) } })
  return { call, close: () => db.destroy() }
}

let database: PostgresDatabase
let app: Awaited<ReturnType<typeof serving>>
let other: Awaited<ReturnType<typeof serving>>
beforeAll(async () => {
  if (!ready) return
  database = await openPostgresDatabase('empty')
  await database.exec((await userTablesMigration(database.db))!)
  await database.exec('create table orders (id integer generated always as identity primary key, amount integer not null)')
  app = await serving()
  other = await serving()
})
afterAll(async () => {
  if (!ready) return
  await app.close()
  await other.close()
  await database.close()
})

const rows = async <T>(query: string) => (await sql.raw<T>(query).execute(database.db)).rows
const version = () => readDefinitionsVersion(database.db)
const tableExists = async (name: string) => (await rows<{ found: boolean }>(`select to_regclass('user_tables.${name}') is not null as found`))[0]!.found
const columnsOf = async (name: string) => (await rows<{ column: string; nullable: string }>(`select column_name as column, is_nullable as nullable from information_schema.columns where table_schema = 'user_tables' and table_name = '${name}' order by ordinal_position`))
const indexesOf = async (name: string) => (await rows<{ definition: string }>(`select indexdef as definition from pg_indexes where schemaname = 'user_tables' and tablename = '${name}' order by indexname`)).map((row) => row.definition.replace(/INDEX \S+ ON/, 'INDEX ON'))
const definitionCount = async (name: string) => Number((await rows<{ count: string }>(`select count(*) from table_definitions.tables where name = '${name}'`))[0]!.count)

const field = (name: string, type = 'text', more: Record<string, unknown> = {}) => ({ name, label: name, type, position: 1, ...more })
// A table with its fields, then its title, in one batch.
const tableBatch = (name: string, fields: ReturnType<typeof field>[], title?: string) => ({
  ops: [
    { op: 'create', resource: 'user_tables', ref: 't', data: { name, singular_label: `${name} one`, plural_label: `${name} all` } },
    ...fields.map((data) => ({ op: 'create', resource: 'user_table_fields', data: { ...data, table_id: { $ref: 't' } } })),
    ...(title ? [{ op: 'update', resource: 'user_tables', key: { $ref: 't' }, etag: '*', data: { title_field: title } }] : []),
  ],
})
const createTable = (name: string, fields: ReturnType<typeof field>[], title?: string, role = 'admin', on = app) => on.call('/api/v1:batchWrite', json(tableBatch(name, fields, title)), role)
const tableId = async (name: string) => (await rows<{ id: string }>(`select id::text from table_definitions.tables where name = '${name}'`))[0]!.id
const addField = async (table: string, data: ReturnType<typeof field>, role = 'admin', on = app) => on.call('/api/v1/user_table_fields', json({ ...data, table_id: Number(await tableId(table)) }), role)

// No refusal names the schemas, the SQL or Postgres's own words.
const expectClean = async (response: Response) => {
  const body = await response.text()
  expect(body).not.toMatch(/table_definitions|user_tables\.|create table|alter table|create index|relation|syntax|violates|duplicate key/i)
}

describe.skipIf(!ready)('creating a table users add through the API', () => {
  it('creates the table, its columns and indexes with its fields, served with filters, sorts and search at once', async () => {
    const before = await version()
    const created = await createTable('notes', [field('title'), field('body', 'long_text'), field('price', 'decimal', { precision: 12, scale: 2 }), field('meta', 'json')], 'title')
    expect(created.status).toBe(200)
    const { results } = (await created.json()) as { results: { record: Record<string, unknown> }[] }
    expect(results[0]!.record).toMatchObject({ name: 'notes', singular_label: 'notes one' })
    expect(await version()).not.toBe(before)
    expect(await columnsOf('notes')).toEqual([
      { column: 'id', nullable: 'NO' }, { column: 'title', nullable: 'YES' }, { column: 'body', nullable: 'YES' }, { column: 'price', nullable: 'YES' }, { column: 'meta', nullable: 'YES' },
    ])
    expect(await indexesOf('notes')).toEqual(expect.arrayContaining([
      'CREATE UNIQUE INDEX ON user_tables.notes USING btree (id)',
      'CREATE INDEX ON user_tables.notes USING btree (title)',
      'CREATE INDEX ON user_tables.notes USING gin (body gin_trgm_ops)',
      'CREATE INDEX ON user_tables.notes USING btree (price)',
      'CREATE INDEX ON user_tables.notes USING gin (title gin_trgm_ops)',
    ]))
    expect(await indexesOf('notes')).toHaveLength(5)
    for (const title of ['Alpha', 'Beta', 'Gamma']) {
      const made = await app.call('/api/v1/notes', json({ title, price: '2' }))
      expect(made.status, await made.text()).toBe(201)
    }
    const listed = await app.call(`/api/v1/notes?filter=${encodeURIComponent('price = 2 AND title != "Beta"')}&order_by=title desc`)
    expect(listed.status).toBe(200)
    expect(((await listed.json()) as { items: { title: string }[] }).items.map((item) => item.title)).toEqual(['Gamma', 'Alpha'])
    // A long text field's pg_trgm index serves its filter, not a sort.
    expect((await app.call(`/api/v1/notes?filter=${encodeURIComponent('body = "*x*"')}`)).status).toBe(200)
    expect((await app.call('/api/v1/notes?order_by=body')).status).toBe(400)
    const searched = await other.call(`/api/v1/notes?filter=${encodeURIComponent('search("amm")')}`)
    expect(((await searched.json()) as { items: { title: string }[] }).items.map((item) => item.title)).toEqual(['Gamma'])
  })

  it('adds a field as a nullable column with its index, read as empty on the records there, and raises the version', async () => {
    const before = await version()
    expect((await addField('notes', field('due', 'date'))).status).toBe(201)
    expect(await version()).not.toBe(before)
    expect((await columnsOf('notes')).at(-1)).toEqual({ column: 'due', nullable: 'YES' })
    expect(await indexesOf('notes')).toContain('CREATE INDEX ON user_tables.notes USING btree (due)')
    const listed = (await (await app.call('/api/v1/notes?order_by=due')).json()) as { items: { due: unknown }[] }
    expect(listed.items.map((item) => item.due)).toEqual([null, null, null])
  })

  it('raises the version when a label changes, and not on a refused write', async () => {
    const before = await version()
    const id = await tableId('notes')
    expect((await app.call(`/api/v1/user_tables/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'if-match': '*' }, body: JSON.stringify({ plural_label: 'Notebook' }) })).status).toBe(200)
    const labelled = await version()
    expect(labelled).not.toBe(before)
    expect((await app.call(`/api/v1/user_table_fields/${id},title`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'if-match': '*' }, body: JSON.stringify({ label: 'Heading' }) })).status).toBe(200)
    expect(await version()).not.toBe(labelled)
    const after = await version()
    expect((await addField('notes', field('Bad'))).status).toBe(400)
    expect(await version()).toBe(after)
  })

  it('never changes a name or type, and never deletes a table or field', async () => {
    const id = await tableId('notes')
    const patch = (path: string, body: unknown) => app.call(path, { method: 'PATCH', headers: { 'content-type': 'application/json', 'if-match': '*' }, body: JSON.stringify(body) })
    expect((await patch(`/api/v1/user_tables/${id}`, { name: 'renamed' })).status).toBe(400)
    expect((await patch(`/api/v1/user_table_fields/${id},title`, { name: 'heading' })).status).toBe(400)
    expect((await patch(`/api/v1/user_table_fields/${id},title`, { type: 'integer' })).status).toBe(400)
    expect((await app.call(`/api/v1/user_table_fields/${id},title`, { method: 'DELETE' })).status).toBe(403)
    expect((await app.call(`/api/v1/user_tables/${id}`, { method: 'DELETE' })).status).toBe(403)
    expect(await tableExists('notes')).toBe(true)
    expect((await columnsOf('notes')).find((column) => column.column === 'title')).toBeDefined()
    expect((await rows<{ type: string }>(`select data_type as type from information_schema.columns where table_schema = 'user_tables' and table_name = 'notes' and column_name = 'title'`))[0]!.type).toBe('text')
  })

  it.each([
    ['a field named id', [field('id')], undefined],
    ['a field named with a quote', [field('a"b')], undefined],
    ['a reserved word', [field('select')], undefined],
    ['a name over 63 bytes', [field('n'.repeat(64))], undefined],
    ['two fields of one name', [field('title'), field('title')], undefined],
    ['a title naming no field', [field('title')], 'heading'],
    ['a title that is no text', [field('count', 'integer')], 'count'],
    ['a required field', [field('title', 'text', { required: true })], undefined],
    ['an unknown type', [field('title', 'uuid')], undefined],
  ])('refuses %s, and creates nothing', async (_, fields, title) => {
    const before = await version()
    const refused = await createTable('refused', fields, title)
    expect([400, 409]).toContain(refused.status)
    await expectClean(refused)
    expect(await tableExists('refused')).toBe(false)
    expect(await definitionCount('refused')).toBe(0)
    expect(await version()).toBe(before)
  })

  it.each(['orders', 'user_tables', 'user_table_fields', 'notes', 'Notes', 'table_definitions.x'])('refuses the table name %j', async (name) => {
    const refused = await createTable(name, [field('title')])
    expect([400, 409]).toContain(refused.status)
    await expectClean(refused)
    expect(await definitionCount(name)).toBe(name === 'notes' ? 1 : 0)
  })

  it('refuses a name a table of the schema has without a definition, and a column the table has', async () => {
    await database.exec('create table user_tables.by_hand (id bigint primary key); alter table user_tables.notes add column extra text')
    const refused = await createTable('by_hand', [field('title')])
    expect(refused.status).toBe(400)
    await expectClean(refused)
    expect(await definitionCount('by_hand')).toBe(0)
    const before = await version()
    expect((await addField('notes', field('extra'))).status).toBe(400)
    expect(await version()).toBe(before)
    expect(Number((await rows<{ count: string }>(`select count(*) from table_definitions.fields where name = 'extra'`))[0]!.count)).toBe(0)
  })

  it('creates one table of two created at once with one name, and refuses the other', async () => {
    const answers = await Promise.all([createTable('twice', [field('title')]), createTable('twice', [field('title')], undefined, 'admin', other)])
    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409])
    expect(await definitionCount('twice')).toBe(1)
    expect((await columnsOf('twice')).map((column) => column.column)).toEqual(['id', 'title'])
  })

  it('answers a field whose column waits past the statement timeout with a 504, and adds nothing', async () => {
    const holding = database.pool({ max: 1 })
    const holder = await holding.connect()
    await holder.query('begin; lock table user_tables.notes in access share mode')
    const before = await version()
    const answer = await addField('notes', field('late'))
    await holder.query('rollback')
    holder.release()
    await holding.end()
    expect(answer.status).toBe(504)
    await expectClean(answer)
    expect((await columnsOf('notes')).map((column) => column.column)).not.toContain('late')
    expect(await version()).toBe(before)
  })
})

describe.skipIf(!ready)('a table taken over as code', () => {
  it('takes no new field', async () => {
    const notes = resource('notes').table('user_tables.notes').fields({ id: f.bigint().readOnly().dbDefault(), title: f.text().optional() }).primaryKey((r) => r.id)
    const owned = await serving(undefined, [orders, notes])
    const before = await version()
    const refused = await addField('notes', field('owned'), 'admin', owned)
    await owned.close()
    expect(refused.status).toBe(400)
    expect(((await refused.json()) as { errors: { field: string }[] }).errors[0]!.field).toBe('table_id')
    expect((await columnsOf('notes')).map((column) => column.column)).not.toContain('owned')
    expect(await version()).toBe(before)
  })
})

describe.skipIf(!ready)('who creates tables users add', () => {
  it('refuses a user without the capability, one with wildcards over resources, and one without or with an unknown role', async () => {
    for (const role of ['member', 'writer', 'everything', '', 'nobody']) {
      const before = await version()
      // A resource the caller may not read is not found, as if it were not there.
      expect([403, 404]).toContain((await createTable(`by_${role || 'none'}`, [field('title')], undefined, role)).status)
      expect([403, 404]).toContain((await addField('notes', field(`by_${role || 'none'}`), role)).status)
      expect(await version()).toBe(before)
      expect(await tableExists(`by_${role || 'none'}`)).toBe(false)
      expect((await columnsOf('notes')).map((column) => column.column)).not.toContain(`by_${role || 'none'}`)
    }
  })

  it('refuses a batch that creates a table to a role that may add fields alone', async () => {
    expect([403, 404]).toContain((await createTable('sneaky', [field('title')], undefined, 'fields_only')).status)
    expect(await tableExists('sneaky')).toBe(false)
    expect(await definitionCount('sneaky')).toBe(0)
  })

  it('keeps a new table and the definitions from anyone but admins, wildcards included', async () => {
    const id = await tableId('notes')
    for (const role of ['member', 'writer', 'everything']) {
      for (const path of ['/api/v1/notes', '/api/v1/notes/1', '/api/v1/user_tables', `/api/v1/user_tables/${id}`, '/api/v1/user_table_fields']) {
        const answer = await app.call(path, {}, role)
        expect([403, 404]).toContain(answer.status)
        expect(await answer.text()).not.toMatch(/Alpha|Gamma/)
      }
      expect((await app.call('/api/v1/notes', json({ title: 'Mine' }), role)).status).toBeGreaterThanOrEqual(403)
      const meta = (await (await app.call('/api/meta', {}, role)).json()) as { resources: { name: string }[] }
      expect(meta.resources.map((model) => model.name)).toEqual(['orders'])
    }
  })
})

describe.skipIf(!ready)('the definitions in the database', () => {
  it('refuse a bad name, type or scale written past the API, with their check constraints', async () => {
    const refusals = [
      `insert into table_definitions.tables (name, singular_label, plural_label) values ('Bad name', 'a', 'b')`,
      `insert into table_definitions.tables (name, singular_label, plural_label) values ('x"; drop table orders; --', 'a', 'b')`,
      `insert into table_definitions.fields (table_id, name, label, type, required, position) values (1, 'ok', 'Ok', 'uuid', false, 1)`,
      `insert into table_definitions.fields (table_id, name, label, type, required, position) values (1, 'id', 'Id', 'text', false, 1)`,
      `insert into table_definitions.fields (table_id, name, label, type, required, position, precision, scale) values (1, 'p', 'P', 'decimal', false, 1, 4, 5)`,
    ]
    for (const statement of refusals) await expect(database.exec(statement)).rejects.toMatchObject({ code: '23514' })
  })

  it('take the default of a new version from the migration, in a database made before it', async () => {
    await database.exec('alter table table_definitions.tables alter column version drop default')
    const migration = await userTablesMigration(database.db)
    expect(migration).toContain('alter table table_definitions.tables alter column version set default 1')
    await database.exec(migration!)
    expect(await userTablesMigration(database.db)).toBeUndefined()
  })

  it('reserve the words Postgres reserves', async () => {
    const words = await rows<{ word: string }>(`select word from pg_get_keywords() where catcode = 'R' order by word`)
    expect(words.map((row) => row.word)).toEqual([...reservedWords].sort())
  })
})

describe.skipIf(!ready)('a write freeze', () => {
  it('answers a new table and a new field as any write then, and creates nothing', async () => {
    const frozen = await serving(database.pool({ max: 2, options: '-c default_transaction_read_only=on' }))
    const before = await version()
    const table = await createTable('frozen', [field('title')], undefined, 'admin', frozen)
    const added = await addField('notes', field('frozen'), 'admin', frozen)
    await frozen.close()
    expect([table.status, added.status]).toEqual([503, 503])
    expect(await tableExists('frozen')).toBe(false)
    expect((await columnsOf('notes')).map((column) => column.column)).not.toContain('frozen')
    expect(await version()).toBe(before)
  })
})
