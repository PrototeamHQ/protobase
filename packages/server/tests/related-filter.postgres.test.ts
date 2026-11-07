import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { defineRoles, f, printFilter, resource, view, where, type AccessContext } from '@protobase/schema'
import { checkViewQueries, createAdmin } from '@protobase/server'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'
import { signTestToken, testAuthenticator } from '../../../test-support/server'
import type { Authenticator, Membership } from '../src/types'

// `related()` under access, on real Postgres: it may only do what the caller could do in two steps, listing the resource
// with the subfilter and then filtering on the keys. The numbers are those of the security review's test cases.

const onlyAdmin = ({ user }: AccessContext) => Boolean(user?.roles?.includes('admin'))

const organizations = resource('organizations').table('organizations').fields({ id: f.integer().readOnly().filterable() }).primaryKey((r) => r.id)

const projects = resource('projects')
  .table('projects')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    org: f.relation('organizations').filterable(),
    name: f.text().filterable(),
    state: f.text().filterable(),
    code: f.text().filterable().access({ read: onlyAdmin }),
    secret: f.text().sensitive(),
    drop: f.text().optional().filterable().access({ read: onlyAdmin, update: () => true }),
    plain: f.text().optional(),
    deleted_at: f.timestamp().optional().readOnly(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.org)
  .softDelete((r) => r.deleted_at)
  .search((r) => [r.name, r.code])

const tickets = resource('tickets')
  .table('tickets')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    org: f.relation('organizations').filterable(),
    project_id: f.relation('projects').optional().filterable(),
    title: f.text().filterable().sortable(),
    body: f.text().optional(),
    owner: f.text().optional().filterable(),
    deleted_at: f.timestamp().optional().readOnly(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.org)
  .softDelete((r) => r.deleted_at)

const memberships = resource('memberships')
  .table('memberships')
  .fields({
    project_id: f.relation('projects').filterable(),
    person: f.text().filterable(),
    org: f.relation('organizations').filterable(),
    deleted_at: f.timestamp().optional().readOnly(),
  })
  .primaryKey((r) => [r.project_id, r.person])
  .tenant((r) => r.org)
  .softDelete((r) => r.deleted_at)

const vault = resource('vault').table('vault').fields({ id: f.integer().readOnly().filterable(), project_id: f.relation('projects').filterable() }).primaryKey((r) => r.id)
const diary = resource('diary')
  .table('diary')
  .fields({ id: f.integer().readOnly().filterable(), project_id: f.relation('projects').filterable(), owner: f.text().filterable() })
  .primaryKey((r) => r.id)
  .access({ read: ({ record, user }) => (record as { owner?: unknown } | undefined)?.owner === user?.id })

const rooms = resource('rooms').table('rooms').fields({ id: f.integer().readOnly().filterable(), team: f.text().filterable() }).primaryKey((r) => r.id)
const notes = resource('room_notes')
  .table('room_notes')
  .fields({ id: f.integer().readOnly().filterable(), room_id: f.relation('rooms').filterable(), project_id: f.relation('projects').filterable() })
  .primaryKey((r) => r.id)
  .parent((r) => r.room_id, 'read')

const unindexed = resource('unindexed')
  .table('unindexed')
  .fields({ id: f.integer().readOnly().filterable(), project_id: f.relation('projects').filterable(), color: f.text().filterable() })
  .primaryKey((r) => r.id)

// Listed across every organization someone is a member of; the second organization's row filter keeps its secret builds hidden.
const builds = resource('builds')
  .table('builds')
  .fields({ id: f.integer().readOnly().filterable().sortable(), org: f.relation('organizations').filterable(), state: f.text().filterable(), project_id: f.relation('projects').optional().filterable() })
  .primaryKey((r) => r.id)
  .tenant((r) => r.org, { across: 'memberships' })

// A public catalog: visitors read published products and the reviews of them, not the suppliers.
const products = resource('products').table('products').fields({ id: f.integer().readOnly().filterable().sortable(), name: f.text().filterable(), published: f.boolean().filterable() }).primaryKey((r) => r.id)
const reviews = resource('reviews').table('reviews').fields({ id: f.integer().readOnly().filterable().sortable(), product_id: f.relation('products').filterable() }).primaryKey((r) => r.id)
const suppliers = resource('suppliers').table('suppliers').fields({ id: f.integer().readOnly().filterable(), product_id: f.relation('products').filterable() }).primaryKey((r) => r.id)

const everything = [organizations, projects, tickets, memberships, vault, diary, rooms, notes, unindexed, builds, products, reviews, suppliers]
type Names = 'organizations' | 'projects' | 'tickets' | 'memberships' | 'vault' | 'diary' | 'rooms' | 'room_notes' | 'unindexed' | 'builds' | 'products' | 'reviews' | 'suppliers'

const roles = defineRoles<Names>({
  admin: ['*'],
  member: [
    'organizations.read',
    { 'projects.read': { fields: ['id', 'org', 'name', 'state', 'secret', 'plain'], filter: 'state != "secret"' } },
    'tickets.read',
    'memberships.read',
    { 'rooms.read': { filter: 'team = "red"' } },
    'room_notes.read',
    'unindexed.read',
    { 'builds.read': { filter: 'state != "secret"' } },
    'diary.read',
  ],
  guest: ['tickets.read'],
  anonymous: [{ 'products.read': { fields: ['id', 'name'], filter: 'published = true' } }, { 'reviews.read': ['id', 'product_id'] }],
})

// The tokens carry the memberships the store would answer.
const authenticate: Authenticator = async (request) => {
  if (!request.headers.get('authorization')) return { user: { id: 'anonymous', roles: ['anonymous'] }, anonymous: true }
  const session = await testAuthenticator(request)
  const token = request.headers.get('authorization')!.split(' ')[1]!
  const { memberships: held } = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { memberships?: Membership[] }
  return held ? { ...session, memberships: async () => held } : session
}

const as = (org: number | undefined, role: string, held?: Membership[]) => ({
  authorization: `Bearer ${signTestToken({ roles: [role], ...(org !== undefined && { tenant: org }), ...(held && { memberships: held }) })}`,
})
const admin = as(1, 'admin')
const member = as(1, 'member')
const guest = as(1, 'guest')

describe.skipIf(!(await postgresTemplateReady('empty')))('related() under access', () => {
  let database: PostgresDatabase
  let app: ReturnType<typeof createAdmin>

  beforeAll(async () => {
    database = await openPostgresDatabase('empty')
    await database.exec(`
      create extension pg_trgm;
      create table organizations (id integer primary key);
      create table projects (id integer primary key, org integer not null references organizations, name text not null, state text not null, code text not null, secret text not null, "drop" text, plain text, deleted_at timestamptz);
      create index on projects (org);
      create index on projects (state);
      create index on projects using gin (name gin_trgm_ops);
      create index on projects using gin (code gin_trgm_ops);
      create index on projects (name);
      create table tickets (id integer primary key, org integer not null references organizations, project_id integer references projects, title text not null, body text, owner text, deleted_at timestamptz);
      create index on tickets (project_id);
      create index on tickets (org, title);
      create index on tickets (org, deleted_at, id);
      create table memberships (project_id integer not null references projects, person text not null, org integer not null references organizations, deleted_at timestamptz, primary key (project_id, person));
      create index on memberships (person, project_id);
      create index on memberships (org);
      create table vault (id integer primary key, project_id integer not null references projects);
      create index on vault (project_id);
      create table diary (id integer primary key, project_id integer not null references projects, owner text not null);
      create index on diary (project_id);
      create table rooms (id integer primary key, team text not null);
      create index on rooms (team);
      create table room_notes (id integer primary key, room_id integer not null references rooms, project_id integer not null references projects);
      create index on room_notes (room_id);
      create index on room_notes (project_id);
      create table unindexed (id integer primary key, project_id integer not null references projects, color text not null);
      create table builds (id integer primary key, org integer not null references organizations, state text not null, project_id integer references projects);
      create index on builds (org, id);
      create index on builds (state);
      create index on builds (project_id);
      create table products (id integer primary key, name text not null, published boolean not null);
      create index on products (published);
      create index on products (name);
      create table reviews (id integer primary key, product_id integer not null references products);
      create index on reviews (product_id);
      create table suppliers (id integer primary key, product_id integer not null references products);
      create index on suppliers (product_id);
      insert into products values (1, 'lamp', true), (2, 'draft', false);
      insert into reviews values (1, 1), (2, 2);
      insert into suppliers values (1, 1);
      insert into organizations values (1), (2);
      insert into projects (id, org, name, state, code, secret, deleted_at) values
        (10, 1, 'open one', 'open', 'alpha', 'hush', null),
        (11, 1, 'hidden one', 'secret', 'beta', 'hush', null),
        (12, 1, 'gone one', 'open', 'gamma', 'hush', now()),
        (20, 2, 'other open', 'open', 'delta', 'hush', null);
      insert into tickets (id, org, project_id, title, owner, deleted_at) values
        (1, 1, 10, 'in open', 'ann', null),
        (2, 1, 11, 'in hidden', 'ann', null),
        (3, 1, 12, 'in gone', 'ann', null),
        (4, 1, null, 'in none', 'ann', null),
        (5, 1, 10, 'deleted in open', 'ann', now()),
        (6, 2, 20, 'in other', 'ann', null),
        (7, 1, 20, 'pointing at the other organization', 'ann', null);
      insert into memberships (project_id, person, org, deleted_at) values
        (10, 'ann', 1, null),
        (11, 'ann', 1, null),
        (12, 'ann', 1, null),
        (20, 'ann', 2, null),
        (10, 'bob', 1, now());
      insert into vault values (1, 10);
      insert into diary values (1, 10, 'ann');
      insert into rooms values (1, 'red'), (2, 'blue');
      insert into room_notes values (1, 1, 10), (2, 2, 11);
      insert into unindexed values (1, 10, 'red');
      insert into builds values (1, 1, 'done', 10), (2, 1, 'secret', 10), (3, 2, 'done', 20), (4, 2, 'secret', 20);`)
    app = createAdmin({
      resources: everything,
      db: database.db,
      authenticate,
      options: { roles },
    })
  })
  afterAll(async () => { await database?.close() })

  const read = (path: string, headers: Record<string, string>) => app.request(`/api/v1${path}`, { headers })
  const list = (name: string, filter: string, headers: Record<string, string>, extra = '') => read(`/${name}?filter=${encodeURIComponent(filter)}&order_by=id${extra}`, headers)
  const ids = async (name: string, filter: string, headers: Record<string, string>) => {
    const response = await list(name, filter, headers)
    expect(response.status).toBe(200)
    return ((await response.json()).items as Array<{ id: number }>).map((item) => item.id)
  }
  const refusal = async (name: string, filter: string, headers: Record<string, string>) => {
    const response = await list(name, filter, headers)
    return { status: response.status, body: await response.json() }
  }
  // The caller's own two steps: list the resource with the subfilter, then filter on the keys.
  const twoSteps = async (name: string, field: string, via: string, key: string, subfilter: string, headers: Record<string, string>) => {
    const listed = await read(`/${via}?fields=${key}&filter=${encodeURIComponent(subfilter)}&page_size=100`, headers)
    expect(listed.status).toBe(200)
    const keys = ((await listed.json()).items as Array<Record<string, number>>).map((item) => item[key]!)
    return keys.length === 0 ? [] : ids(name, `in(${field}, ${keys.join(', ')})`, headers)
  }

  const sameRefusal = async (filters: string[], headers = member) => {
    const answers = await Promise.all(filters.map((filter) => refusal('tickets', filter, headers)))
    for (const answer of answers) {
      expect(answer.status).toBe(400)
      expect(answer.body.errors[0].code).toBe('unknown-field')
    }
    return answers
  }

  it('narrows through a relation, and matches the two steps', async () => {
    expect(await ids('tickets', 'related(project_id, projects.id, (name = "open one"))', member)).toEqual([1])
    expect(await ids('tickets', 'related(project_id, memberships.project_id, (person = "ann"))', member)).toEqual([1, 2, 3])
    expect(await ids('tickets', 'related(project_id, memberships.project_id, (person = "ann")) AND title = "in open"', member)).toEqual([1])
    expect(await twoSteps('tickets', 'project_id', 'memberships', 'project_id', 'person = "ann"', member)).toEqual([1, 2, 3])
  })

  it('1 and 2: a hidden resource, an unlistable one and one that does not exist answer alike', async () => {
    const [hidden, unlistable, missing] = await sameRefusal([
      'related(project_id, vault.project_id, (id = 1))',
      'related(project_id, diary.project_id, (id = 1))',
      'related(project_id, nothing.project_id, (id = 1))',
    ])
    const named = (text: string, resource: string) => text.replaceAll(resource, 'X')
    expect(named(hidden!.body.errors[0].message, 'vault')).toBe(named(missing!.body.errors[0].message, 'nothing'))
    expect(named(unlistable!.body.errors[0].message, 'diary')).toBe(named(missing!.body.errors[0].message, 'nothing'))
    expect(unlistable!.body.errors[0].hint).toBe(missing!.body.errors[0].hint)
    expect(hidden!.body.errors[0].hint).toBe(missing!.body.errors[0].hint)
    expect((await read('/diary', member)).status).toBe(403)
    expect(hidden!.body.title).toBe(missing!.body.title)
  })

  it('3: a subfilter naming a hidden, sensitive or write-only field is refused as an unknown one', async () => {
    const [hidden, sensitive, written, unknown] = await Promise.all([
      refusal('tickets', 'related(project_id, projects.id, (code = "alpha"))', member),
      refusal('tickets', 'related(project_id, projects.id, (secret = "hush"))', member),
      refusal('tickets', 'related(project_id, projects.id, (drop = "x"))', member),
      refusal('tickets', 'related(project_id, projects.id, (nothing = "x"))', member),
    ])
    for (const answer of [hidden, sensitive, written, unknown]) {
      expect(answer.status).toBe(400)
      expect(answer.body.errors[0].code).toBe('unknown-field')
    }
    expect(hidden.body.errors[0].hint).toBe(sensitive.body.errors[0].hint)
  })

  it('3: a search in a subfilter reads only the fields the caller reads', async () => {
    expect(await ids('tickets', 'related(project_id, projects.id, (search("open one")))', admin)).toEqual([1])
    expect(await ids('tickets', 'related(project_id, projects.id, (search("alpha")))', admin)).toEqual([1])
    expect(await ids('tickets', 'related(project_id, projects.id, (search("alpha")))', member)).toEqual([])
    expect(await ids('tickets', 'related(project_id, projects.id, (search("open one")))', member)).toEqual([1])
  })

  it('4: a hidden, sensitive or write-only key is refused as an unknown one', async () => {
    await sameRefusal(['related(title, projects.code)', 'related(title, projects.secret)', 'related(title, projects.drop)', 'related(project_id, projects.nothing)'])
  })

  it('5: an outer field the caller reads but may not filter on is refused as filtering on it is', async () => {
    const direct = await refusal('tickets', 'isNull(body)', member)
    const through = await refusal('tickets', 'related(body, projects.id, (id = 10))', member)
    expect(through.status).toBe(400)
    expect(through.body.errors[0].code).toBe(direct.body.errors[0].code)
    expect(through.body.errors[0].message).toBe(direct.body.errors[0].message)
  })

  it('6: another organization stays out of the rows and the count', async () => {
    const response = await list('tickets', 'related(project_id, projects.id, (name = "other open"))', member, '&count=exact')
    const body = await response.json()
    expect(body.items).toEqual([])
    expect(body.total_size).toBe(0)
    expect(await ids('tickets', 'related(project_id, memberships.project_id, (org = 2))', member)).toEqual([])
    expect(await ids('tickets', 'related(project_id, projects.id, (name = "open one"))', as(2, 'member'))).toEqual([])
  })

  it('7: a list across organizations reads the session\'s own alone', async () => {
    const both = as(1, 'member', [{ tenant: 2, roles: ['member'] }])
    expect(await ids('builds', 'state = "done"', both)).toEqual([1, 3])
    expect(await ids('builds', 'related(project_id, projects.id, (state = "open"))', both)).toEqual([1])
    const other = as(2, 'member', [{ tenant: 1, roles: ['member'] }])
    expect(await ids('builds', 'related(project_id, projects.id, (state = "open"))', other)).toEqual([3])
  })

  it('8: inside NOT or OR it is refused the same, whatever it names', async () => {
    const filters = [
      'NOT related(project_id, projects.id, (id = 10))',
      'NOT related(project_id, vault.project_id, (id = 1))',
      'NOT related(project_id, nothing.id)',
      'title = "x" OR related(project_id, projects.id, (id = 10))',
      'title = "x" OR related(project_id, vault.project_id)',
      'related(project_id, projects.id, (name = "x" OR related(id, memberships.project_id)))',
      'related(project_id, vault.project_id, (name = "x" OR related(id, memberships.project_id)))',
    ]
    const answers = await Promise.all(filters.map((filter) => refusal('tickets', filter, member)))
    for (const answer of answers) {
      expect(answer.status).toBe(400)
      expect(answer.body.errors[0].code).toBe('unsupported-traversal')
      expect(answer.body.errors[0].message).toBe(answers[0]!.body.errors[0].message)
    }
  })

  it('9: an access rule, a role or a view cannot hold it', async () => {
    const ruled = resource('labels').table('labels').fields({ id: f.integer().readOnly().filterable() }).primaryKey((r) => r.id).access({ read: () => 'related(id, tickets.id)' })
    const refused: unknown[] = []
    const served = createAdmin({ resources: [ruled], db: database.db, authenticate, options: { onUnhandledError: (error) => refused.push(error) } })
    expect((await served.request('/api/v1/labels', { headers: admin })).status).toBe(500)
    expect(String(refused[0])).toContain('related()')
    const inView = view<typeof tickets>('tickets').list((r) => ({ columns: [r.title], filter: 'related(project_id, projects.id)' }))
    expect(() => checkViewQueries([tickets.toModel()], [inView.toModel()])).toThrow('related()')
    const inRole = defineRoles<'tickets'>({ member: [{ 'tickets.read': { filter: 'related(project_id, projects.id)' } }] })
    expect(() => createAdmin({ resources: everything, db: database.db, authenticate, options: { roles: inRole } })).toThrow('related()')
  })

  it('10: a row the outer row filter hides stays out of rows, counts and facets', async () => {
    const filter = 'related(id, memberships.project_id, (person = "ann"))'
    expect(await ids('projects', filter, member)).toEqual([10])
    expect(await ids('projects', filter, admin)).toEqual([10, 11, 12].filter((id) => id !== 12))
    const counted = await (await list('projects', filter, member, '&count=exact')).json()
    expect(counted.total_size).toBe(1)
    const facets = await (await read(`/projects:facets?field=state&filter=${encodeURIComponent(filter)}`, member)).json()
    expect(facets.facets).toEqual([{ value: 'open', count: 1 }])
    const grouped = await (await read(`/projects:aggregate?group_by=state&filter=${encodeURIComponent(filter)}`, member)).json()
    expect(grouped.groups.map((group: { value: string; count: number }) => [group.value, group.count])).toEqual([['open', 1]])
  })

  it('11: a row whose field is null does not match', async () => {
    expect(await ids('tickets', 'related(project_id, projects.id)', admin)).not.toContain(4)
    expect(await ids('tickets', 'related(project_id, memberships.project_id)', admin)).not.toContain(4)
  })

  it('12: show_deleted reaches the outer rows only', async () => {
    const shown = await (await list('tickets', 'related(project_id, projects.id, (name = "open one"))', admin, '&show_deleted=true')).json()
    expect(shown.items.map((item: { id: number }) => item.id)).toEqual([1, 5])
    const gone = await (await list('tickets', 'related(project_id, projects.id, (name = "gone one"))', admin, '&show_deleted=true')).json()
    expect(gone.items).toEqual([])
    const bob = await (await list('tickets', 'related(project_id, memberships.project_id, (person = "bob"))', admin, '&show_deleted=true')).json()
    expect(bob.items).toEqual([])
  })

  it('13: fields that do not point at one resource are refused', async () => {
    await sameRefusal([
      'related(project_id, tickets.id, (id = 1))',
      'related(title, projects.id)',
      'related(project_id, projects.name)',
      'related(project_id, memberships.person)',
      'related(owner, memberships.person)',
    ])
  })

  it('14: more depth or terms than the caps allow are refused before anything is read', async () => {
    const term = 'related(project_id, projects.id)'
    expect((await refusal('tickets', `${term} AND ${term} AND ${term}`, member)).status).toBe(200)
    const many = await refusal('tickets', `${term} AND ${term} AND ${term} AND ${term}`, member)
    expect(many.status).toBe(400)
    expect(many.body.errors[0].code).toBe('unsupported')
    const nested = await refusal('tickets', `${term} AND ${term} AND ${term.replace(')', ', (related(id, tickets.project_id)))')}`, member)
    expect(nested.body.errors[0].code).toBe('unsupported')
    const deep = await refusal('tickets', 'related(project_id, projects.id, (related(id, memberships.project_id, (related(project_id, vault.project_id)))))', member)
    expect(deep.status).toBe(400)
    expect(deep.body.errors[0].code).toBe('too-deep')
    expect((await refusal('tickets', 'related(project_id, projects.id, (related(id, memberships.project_id, (person = "ann"))))', member)).status).toBe(200)
  })

  it('15: without a token it reads no more than the two steps', async () => {
    const anonymous = {}
    expect(await ids('reviews', 'related(product_id, products.id, (name = "lamp"))', anonymous)).toEqual([1])
    expect(await ids('reviews', 'related(product_id, products.id, (name = "draft"))', anonymous)).toEqual([])
    expect(await ids('reviews', 'related(product_id, products.id)', anonymous)).toEqual(await twoSteps('reviews', 'product_id', 'products', 'id', 'id > 0', anonymous))
    const hidden = await refusal('reviews', 'related(product_id, suppliers.product_id)', anonymous)
    const missing = await refusal('reviews', 'related(product_id, nothing.product_id)', anonymous)
    expect(hidden.status).toBe(400)
    expect(hidden.body.errors[0].code).toBe('unknown-field')
    expect(hidden.body.errors[0].hint).toBe(missing.body.errors[0].hint)
  })

  it('18: a subfilter that fails gives the error a direct list gives', async () => {
    const direct = await refusal('projects', 'id = "x"', member)
    const through = await refusal('tickets', 'related(project_id, projects.id, (id = "x"))', member)
    expect(through.status).toBe(direct.status)
    expect(through.body.errors[0].code).toBe(direct.body.errors[0].code)
  })

  it('a caller with no tenant is told nothing of a tenant-scoped resource', async () => {
    const none = as(undefined, 'admin')
    const hidden = await refusal('products', 'related(id, memberships.project_id)', none)
    const missing = await refusal('products', 'related(id, nothing.project_id)', none)
    expect(hidden.status).toBe(400)
    expect(hidden.body.errors[0].code).toBe('unknown-field')
    expect(hidden.body.errors[0].hint).toBe(missing.body.errors[0].hint)
  })

  it('keeps a row filter and a read parent of the related resource', async () => {
    expect(await ids('tickets', 'related(project_id, projects.id, (name = "hidden one"))', member)).toEqual([])
    expect(await ids('tickets', 'related(project_id, projects.id, (name = "hidden one"))', admin)).toEqual([2])
    expect(await ids('tickets', 'related(project_id, room_notes.project_id)', member)).toEqual([1])
  })

  it('takes every list-style read', async () => {
    const filter = 'related(project_id, projects.id, (name = "open one"))'
    const encoded = encodeURIComponent(filter)
    expect((await (await app.request('/api/v1/tickets:search', { method: 'POST', headers: { ...member, 'content-type': 'application/json' }, body: JSON.stringify({ filter }) })).json()).items.map((item: { id: number }) => item.id)).toEqual([1])
    expect((await (await read(`/tickets:seek?filter=${encoded}&order_by=id&position=0`, member)).json()).items.map((item: { id: number }) => item.id)).toEqual([1])
    expect((await (await read(`/tickets:facets?field=project_id&filter=${encoded}`, member)).json()).facets).toEqual([{ value: 10, count: 1 }])
    expect((await read(`/tickets:series?field=deleted_at&filter=${encoded}&range=all`, member)).status).toBe(200)
    expect((await read(`/tickets:histogram?field=id&filter=${encoded}`, member)).status).toBe(200)
  })

  it('needs indexes on the outer field, the subfilter and the key, under the scan guard', async () => {
    const color = await refusal('tickets', 'related(project_id, unindexed.project_id, (color = "red"))', member)
    expect(color.status).toBe(400)
    expect(color.body.type).toBe('urn:protobase:problem:expensive-query')
    const key = await refusal('tickets', 'related(project_id, unindexed.project_id)', member)
    expect(key.status).toBe(400)
    expect(key.body.suggestion).toBe('create index on "unindexed" ("project_id")')
    const outer = await refusal('tickets', 'related(owner, projects.id)', member)
    expect(outer.status).toBe(400)
  })

  it('a cursor continues only the list that held the same terms', async () => {
    const first = await (await list('tickets', 'related(project_id, memberships.project_id, (person = "ann"))', member, '&page_size=1')).json()
    expect(first.next_page_token).not.toBe('')
    const token = encodeURIComponent(first.next_page_token)
    expect((await list('tickets', 'related(project_id, memberships.project_id, (person = "ann"))', member, `&page_size=1&page_token=${token}`)).status).toBe(200)
    expect((await list('tickets', 'related(project_id, memberships.project_id, (person = "bob"))', member, `&page_size=1&page_token=${token}`)).status).toBe(400)
    expect((await list('tickets', '', member, `&page_size=1&page_token=${token}`)).status).toBe(400)
  })

  it('asks for the extension a subfilter needs, before any query runs', async () => {
    const bare = await openPostgresDatabase('empty')
    await bare.exec(`create table items (id integer primary key, name text not null); insert into items values (1, 'lamp');`)
    const items = resource('items').table('items').fields({ id: f.integer().readOnly().filterable(), name: f.text().filterable() }).primaryKey((r) => r.id)
    const served = createAdmin({ resources: [items], db: bare.db, authenticate, options: { scanGuard: { mode: 'off' } } })
    const response = await served.request(`/api/v1/items?filter=${encodeURIComponent('related(id, items.id, (similar(name, "lamp")))')}`, { headers: admin })
    expect(response.status).toBe(501)
    expect((await response.json()).detail).toContain('pg_trgm')
  })

  it('where.related prints what the API reads', async () => {
    expect(await ids('tickets', printFilter(where.related('project_id', 'projects', 'id', where.eq('name', 'open one'))), member)).toEqual([1])
  })
})
