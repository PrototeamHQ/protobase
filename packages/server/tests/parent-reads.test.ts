import { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource, where } from '@protobase/schema'
import { createAdmin } from '../src/index'
import { signTestToken, testAuthenticator } from '../../../test-support/server'
import { openSnapshotDb, type SnapshotDb } from '../../../test-support/sql-snapshot'

// A workspace chat: a channel is read by everyone when public and by its members when private, a direct message by its
// members, and a message under `.parent(..., 'read')` by whoever reads the channel or direct message it names.

const channels = resource('channels')
  .table('channels')
  .fields({
    id: f.integer().filterable().sortable(),
    tenant_id: f.integer().readOnly(),
    kind: f.enum(['public', 'private']),
    member_ids: f.json(),
    deleted_at: f.timestamp().optional().readOnly(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.tenant_id)
  .softDelete((r) => r.deleted_at)
  .access({ read: (ctx) => where.or(where.eq('kind', 'public'), where.has('member_ids', ctx.user!.id as string)) })

const directMessages = resource('direct_messages')
  .table('direct_messages')
  .fields({ id: f.integer().filterable().sortable(), tenant_id: f.integer().readOnly(), member_ids: f.json() })
  .primaryKey((r) => r.id)
  .tenant((r) => r.tenant_id)
  .access({ read: (ctx) => where.has('member_ids', ctx.user!.id as string) })

const messages = resource('messages')
  .table('messages')
  .fields({
    id: f.integer().filterable().sortable(),
    tenant_id: f.integer().readOnly(),
    channel_id: f.relation('channels').optional().filterable(),
    direct_message_id: f.relation('direct_messages').optional().filterable(),
    body: f.text().filterable(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.tenant_id)
  .search((r) => [r.body])
  .parent((r) => r.channel_id, 'read')
  .parent((r) => r.direct_message_id, 'read')

const reactions = resource('reactions')
  .table('reactions')
  .fields({ id: f.integer().filterable().sortable(), message_id: f.relation('messages'), emoji: f.text() })
  .primaryKey((r) => r.id)

// No index serves its relation to the channel
const pins = resource('pins')
  .table('pins')
  .fields({ id: f.integer().filterable().sortable(), channel_id: f.relation('channels') })
  .primaryKey((r) => r.id)
  .parent((r) => r.channel_id, 'read')

// A room's read rule reads the record, which no query can hold
const rooms = resource('rooms')
  .table('rooms')
  .fields({ id: f.integer().filterable().sortable(), open: f.boolean() })
  .primaryKey((r) => r.id)
  .access({ read: (_ctx, record) => (record as { open: boolean }).open })

const posts = resource('posts')
  .table('posts')
  .fields({ id: f.integer().filterable().sortable(), room_id: f.relation('rooms').optional().filterable() })
  .primaryKey((r) => r.id)
  .parent((r) => r.room_id, 'read')

// A tree: a folder is read by its owner, and under a parent folder only when that one is read too
const folders = resource('folders')
  .table('folders')
  .fields({ id: f.integer().filterable().sortable(), owner_id: f.text().filterable(), parent_id: f.relation('folders').optional().filterable() })
  .primaryKey((r) => r.id)
  .access({ read: (ctx) => where.eq('owner_id', ctx.user!.id as string) })
  .parent((r) => r.parent_id, 'read')

let pg: SnapshotDb
let db: Kysely<any>
let app: ReturnType<typeof createAdmin>
beforeAll(async () => {
  pg = await openSnapshotDb('empty')
  await pg.exec(`
    create table channels (id integer primary key, tenant_id integer not null, kind text not null, member_ids jsonb not null, deleted_at timestamptz);
    create index on channels using gin (member_ids);
    create index on channels (kind);
    create table direct_messages (id integer primary key, tenant_id integer not null, member_ids jsonb not null);
    create index on direct_messages using gin (member_ids);
    create table messages (id integer primary key, tenant_id integer not null, channel_id integer references channels, direct_message_id integer references direct_messages, body text not null);
    create index on messages (id);
    create index on messages (channel_id);
    create index on messages (direct_message_id);
    create index on messages (body);
    create extension if not exists pg_trgm;
    create index on messages using gin (body gin_trgm_ops);
    create table reactions (id integer primary key, message_id integer not null references messages, emoji text not null);
    create table pins (id integer primary key, channel_id integer not null references channels);
    create table rooms (id integer primary key, open boolean not null);
    create table posts (id integer primary key, room_id integer references rooms);
    create index on posts (room_id);
    create table folders (id integer primary key, owner_id text not null, parent_id integer references folders);
    create index on folders (owner_id);
    create index on folders (parent_id);
    insert into channels values
      (1, 1, 'public', '[]', null), (2, 1, 'private', '["alice"]', null), (3, 1, 'private', '["alice", "bob"]', '2026-07-01'),
      (4, 2, 'public', '[]', null);
    insert into direct_messages values (1, 1, '["alice", "bob"]');
    insert into messages values
      (1, 1, 1, null, 'hello all'), (2, 1, 2, null, 'secret plan'), (3, 1, 3, null, 'gone channel'),
      (4, 1, 4, null, 'other workspace'), (5, 1, null, 1, 'just us'), (6, 1, null, null, 'no conversation');
    insert into reactions values (1, 1, 'wave'), (2, 2, 'eyes');
    insert into pins values (1, 1);
    insert into rooms values (1, true), (2, false);
    insert into posts values (1, 1), (2, 2), (3, null);
    insert into folders values (1, 'alice', null), (2, 'alice', 1), (3, 'bob', null), (4, 'alice', 3);
  `)
  db = new Kysely({ dialect: pg.dialect })
  app = createAdmin({ resources: [channels, directMessages, messages, reactions, pins, rooms, posts, folders], db, authenticate: testAuthenticator })
})
afterAll(async () => { await db.destroy() })

const as = (sub: string) => ({ authorization: `Bearer ${signTestToken({ sub, roles: ['member'], tenant: 1 })}`, 'content-type': 'application/json' })
const get = (path: string, sub: string) => app.request(`/api/v1${path}`, { headers: as(sub) })
const ids = async (path: string, sub: string) => {
  const response = await get(path, sub)
  expect(response.status, await response.clone().text()).toBe(200)
  return ((await response.json()).items as { id: number }[]).map((item) => item.id)
}
const total = async (path: string, sub: string) => {
  const body = await (await get(path, sub)).json()
  return (body.groups as { count: number }[]).reduce((sum, group) => sum + group.count, 0)
}

describe('a child under .parent(fk, "read")', () => {
  it("lists only the messages of conversations the caller reads, a message naming none included", async () => {
    expect(await ids('/messages?order_by=id', 'alice')).toEqual([1, 2, 5, 6])
    expect(await ids('/messages?order_by=id', 'bob')).toEqual([1, 5, 6])
    expect(await ids('/messages?order_by=id', 'carol')).toEqual([1, 6])
  })

  it('answers a get outside them with 404, as other row filters do', async () => {
    expect((await get('/messages/2', 'alice')).status).toBe(200)
    expect((await get('/messages/2', 'bob')).status).toBe(404)
    expect((await get('/messages/5', 'carol')).status).toBe(404)
  })

  it('hides the messages of a soft-deleted channel and of a channel in another workspace', async () => {
    for (const id of [3, 4]) expect((await get(`/messages/${id}`, 'alice')).status).toBe(404)
  })

  it('narrows :search, :seek, counts, aggregates and labels the same way', async () => {
    const searched = await app.request('/api/v1/messages:search', { method: 'POST', headers: as('bob'), body: JSON.stringify({ filter: 'search("plan") OR search("hello")' }) })
    expect(((await searched.json()).items as { id: number }[]).map((item) => item.id)).toEqual([1])
    expect(await ids('/messages:seek?position=0&order_by=id', 'bob')).toEqual([1, 5, 6])
    expect(await total('/messages:aggregate?group_by=channel_id', 'bob')).toBe(3)
    expect(await total('/messages:aggregate?group_by=channel_id', 'alice')).toBe(4)
    const facets = await (await get('/messages:facets?field=channel_id', 'bob')).json()
    expect(facets.facets.map((facet: { value: number | null }) => facet.value).sort()).toEqual([1, null])
    const labelled = await (await get('/reactions?order_by=id&labels=message_id.body', 'bob')).json()
    expect(JSON.stringify(labelled)).toContain('hello all')
    expect(JSON.stringify(labelled)).not.toContain('secret plan')
  })

  it('hides them once the caller leaves the channel, and shows them again when they are back', async () => {
    await pg.exec(`update channels set member_ids = '[]' where id = 2`)
    expect(await ids('/messages?order_by=id', 'alice')).toEqual([1, 5, 6])
    await pg.exec(`update channels set member_ids = '["alice"]' where id = 2`)
    expect(await ids('/messages?order_by=id', 'alice')).toEqual([1, 2, 5, 6])
  })

  it('refuses a list whose relation to the parent no index serves', async () => {
    const response = await get('/pins', 'alice')
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ type: 'urn:protobase:problem:expensive-query', columns: [{ field: 'channel_id', use: 'parent', need: 'btree' }] })
  })

  it('shows only the children naming no parent when the parent read rule reads the record', async () => {
    expect(await ids('/posts?order_by=id', 'alice')).toEqual([3])
    expect((await get('/posts/1', 'alice')).status).toBe(404)
  })

  it('checks a resource that is its own parent one level up', async () => {
    expect(await ids('/folders?order_by=id', 'alice')).toEqual([1, 2])
    expect(await ids('/folders?order_by=id', 'bob')).toEqual([3])
  })
})
