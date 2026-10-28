import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createAdaptorServer, upgradeWebSocket } from '@hono/node-server'
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import { changesMigration, createAdmin, jwtVerifier, startJobs, type JobsRuntime } from '@protobase/server'
import { npmWs } from './support/npm-ws'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'

// The dispatch job and the notice feed poll on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 30_000 })

const publishable = 'sb_publishable_realtime_filters'
const secret = 'sb_secret_realtime_filters'
const issuer = 'https://app.example.com'

const todos = resource('todos')
  .table('todos')
  .fields({ id: f.integer(), user_id: f.text(), title: f.text(), note: f.text(), owner: f.text(), status: f.text(), payload: f.text(), secret: f.text(), public: f.boolean(), label: f.text() })
  .primaryKey((r) => r.id)
  .live()
const messages = resource('messages').table('messages').fields({ id: f.integer(), body: f.text() }).primaryKey((r) => r.id).live()
const stats = resource('private_stats').table('private_stats').fields({ id: f.integer(), n: f.integer() }).primaryKey((r) => r.id).live()

// Anon sees public todos and every column but `secret`; a signed-in user sees every todo and column. Anon may not
// select private_stats at all. `label` compares case-insensitively, a collation Postgres's regexes do not take.
const schema = `
do $$ begin create role anon nologin; exception when duplicate_object or unique_violation then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object or unique_violation then null; end $$;
create collation case_insensitive (provider = icu, locale = 'und-u-ks-level2', deterministic = false);
create type todo_status as enum ('open', 'done');
create table todos (id integer primary key, user_id text, title text, note text, owner uuid, status todo_status, payload json, secret text, public boolean not null, label text collate case_insensitive);
alter table todos enable row level security;
create policy "public todos" on todos for select to anon using (public);
create policy "all todos" on todos for select to authenticated using (true);
grant select (id, user_id, title, note, owner, status, payload, public, label) on todos to anon;
grant select on todos to authenticated;
create table messages (id integer primary key, body text);
grant select on messages to anon, authenticated;
create table private_stats (id integer primary key, n integer);
`

type Joined = { channel: RealtimeChannel; heard: Record<string, unknown>[]; statuses: string[]; error?: string }

describe.skipIf(!(await postgresTemplateReady('jobs')))('Realtime postgres_changes filters, one subscriber\'s never another\'s', () => {
  let pg: PostgresDatabase
  let runtime: JobsRuntime
  let server: Server
  let url: string
  let tokenOf: (sub: string) => Promise<string>
  let nextId = 1000
  const clients: SupabaseClient[] = []
  const errors: unknown[] = []

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    await pg.exec(schema)
    await pg.exec((await changesMigration(pg.db, [todos.toModel(), messages.toModel(), stats.toModel()]))!)
    const pair = await generateKeyPair('ES256')
    const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), alg: 'ES256', kid: 'k1' }] })
    tokenOf = (sub) => new SignJWT({ sub, role: 'authenticated' }).setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setIssuer(issuer).setAudience(issuer).setExpirationTime('5m').sign(pair.privateKey)
    const admin = createAdmin({
      resources: [todos, messages, stats],
      db: pg.db,
      authenticate: () => ({ user: { id: 'admin', roles: ['admin'] } }),
      files: { storage: false },
      options: { apiKeys: { publishable_key: publishable, secret_key: secret }, onUnhandledError: (error) => errors.push(error) },
      verifyToken: jwtVerifier({ keys, issuer, audience: issuer }),
      upgradeWebSocket,
    })
    runtime = await startJobs({ db: pg.db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
    server = createAdaptorServer({ fetch: admin.fetch, websocket: { server: new npmWs.WebSocketServer({ noServer: true }) } }) as Server
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    for (const client of clients) await client.removeAllChannels()
    if (server) await new Promise((resolve) => server.close(resolve))
    await runtime?.stop()
    await pg?.close()
    expect(errors).toEqual([])
  })

  const client = async (key = publishable, sub?: string) => {
    const token = sub === undefined ? undefined : await tokenOf(sub)
    const created = createClient(`${url}/api/sb`, key, token === undefined ? {} : { accessToken: async () => token })
    clients.push(created)
    if (token !== undefined) await created.realtime.setAuth(token)
    return created
  }

  // A channel listening to `table` with `filter`, once its join was answered: subscribed, or refused with its reason.
  const join = async (from: SupabaseClient, table: string, filter?: string | string[]): Promise<Joined> => {
    const heard: Record<string, unknown>[] = []
    const statuses: string[] = []
    let channel = from.channel(`${table}-${nextId++}`)
    for (const one of Array.isArray(filter) ? filter : [filter]) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, ...(one !== undefined && { filter: one }) }, (payload) => heard.push(payload.eventType === 'DELETE' ? payload.old : payload.new))
    }
    const error = await new Promise<string | undefined>((resolve) => {
      channel.subscribe((status, failure) => {
        statuses.push(status)
        if (status === 'SUBSCRIBED') resolve(undefined)
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resolve(failure?.message ?? status)
      })
    })
    // realtime-js joins a refused channel again and again: it is left at once.
    if (error !== undefined) await from.removeChannel(channel)
    return { channel, heard, statuses, ...(error !== undefined && { error }) }
  }

  const insert = (id: number, values: { public?: boolean; title?: string } = {}) =>
    sql`insert into todos (id, user_id, title, public) values (${id}, 'u', ${values.title ?? `todo ${id}`}, ${values.public ?? true})`.execute(pg.db)

  const ids = (joined: Joined) => joined.heard.map((row) => row.id)

  const until = (check: () => void) => vi.waitFor(check, { timeout: 20_000, interval: 50 })

  it('refuses at join each filter Postgres would refuse under the caller, and the others of the process still hear', async () => {
    const anon = await client()
    const b = await join(anon, 'todos')
    const refused = [
      'id=eq.abc',
      'id=in.(1,abc)',
      'user_id=match.[a',
      'title=match.(a)\\2',
      'title=match.\\p{L}',
      'id=eq.2147483648',
      'id=eq.1.5',
      'owner=eq.undefined',
      'status=eq.bogus',
      'title=eq.a\u0000b',
      'payload=eq.{}',
      'payload=gt.{}',
      'id=match.1',
      'secret=eq.x',
      'label=match.a',
      'title=like.a\\',
    ]
    for (const filter of refused) {
      const a = await join(anon, 'todos', filter)
      expect(a.error, filter).toMatch(/Unable to subscribe to changes|must not end with an escape character/)
      // The reply names A's own filter at most: no SQL, no Postgres message, no other binding.
      expect(a.error, filter).not.toMatch(/select|invalid input|syntax|regular expression|permission|todos t/i)
    }
    const unknown = await join(anon, 'todos', 'id) or (true=eq.1')
    expect(unknown.error).toBe('invalid column for filter id) or (true')
    const both = await join(anon, 'todos', ['id=eq.5', 'id=eq.abc'])
    expect(both.error).toMatch(/Unable to subscribe to changes/)
    await insert(5)
    await until(() => expect(ids(b)).toEqual([5]))
    expect(both.heard).toEqual([])
    expect(b.statuses).toEqual(['SUBSCRIBED'])
  })

  it('accepts the filters Postgres takes, and each hears only its rows', async () => {
    const anon = await client()
    const five = await join(anon, 'todos', 'id=eq.5000')
    const open = await join(anon, 'todos', 'status=eq.open')
    const owner = await join(anon, 'todos', 'owner=eq.7d3f3f0c-6a43-4c2e-9b1e-0d4c1f9c2a11')
    const pattern = await join(anon, 'todos', 'title=match.(?i)abc')
    const all = await join(anon, 'todos')
    for (const joined of [five, open, owner, pattern]) expect(joined.error).toBeUndefined()
    await sql`insert into todos (id, title, status, owner, public) values (5000, 'none', null, null, true), (5001, 'xABCx', 'open', '7d3f3f0c-6a43-4c2e-9b1e-0d4c1f9c2a11', true)`.execute(pg.db)
    await until(() => expect(ids(all)).toEqual([5000, 5001]))
    expect(ids(five)).toEqual([5000])
    expect(ids(open)).toEqual([5001])
    expect(ids(owner)).toEqual([5001])
    expect(ids(pattern)).toEqual([5001])
  })

  it('accepts with the secret key a filter on a column anon may not select', async () => {
    const app = await client(secret)
    const joined = await join(app, 'todos', 'secret=eq.x')
    expect(joined.error).toBeUndefined()
    await sql`insert into todos (id, secret, public) values (6000, 'x', false), (6001, 'y', false)`.execute(pg.db)
    await until(() => expect(ids(joined)).toEqual([6000]))
  })

  it('ends a signed-in channel whose filter its new caller may not use, once it signs out, and anon still hears', async () => {
    const user = await client(publishable, 'ursula')
    const u = await join(user, 'todos', 'secret=eq.x')
    expect(u.error).toBeUndefined()
    const b = await join(await client(), 'todos')
    // On sign-out supabase-js sends the publishable key as the token.
    await user.realtime.setAuth(publishable)
    await until(() => expect(u.statuses.at(-1)).not.toBe('SUBSCRIBED'))
    await sql`insert into todos (id, secret, public) values (7000, 'x', false), (7001, 'x', true)`.execute(pg.db)
    await until(() => expect(ids(b)).toEqual([7001]))
    expect(u.heard).toEqual([])
  })

  it('leaves a table anon may not select out of the anon group\'s changes, and its other tables still deliver', async () => {
    const anon = await client()
    const a = await join(anon, 'private_stats')
    const b = await join(anon, 'messages')
    await pg.db.transaction().execute(async (trx) => {
      await sql`insert into private_stats (id, n) values (1, 1)`.execute(trx)
      await sql`insert into messages (id, body) values (1, 'hello')`.execute(trx)
    })
    await until(() => expect(ids(b)).toEqual([1]))
    expect(a.heard).toEqual([])
  })

  it('ends only the channel of a filter that a dropped column fails, and the rest of its group hears the same batch', async () => {
    await sql`alter table todos replica identity full`.execute(pg.db)
    const anon = await client()
    const a = await join(anon, 'todos', 'note=eq.x')
    const b = await join(anon, 'todos')
    const d = await join(anon, 'todos', 'id=eq.8000')
    const c = await join(anon, 'messages')
    expect(a.error).toBeUndefined()
    await sql`alter table todos drop column note`.execute(pg.db)
    await pg.db.transaction().execute(async (trx) => {
      await sql`insert into todos (id, title, public) values (8000, 'shown', true), (8001, 'hidden', false)`.execute(trx)
      await sql`insert into messages (id, body) values (8000, 'hi')`.execute(trx)
    })
    await until(() => expect(ids(c)).toEqual([8000]))
    await until(() => expect(ids(b)).toEqual([8000]))
    expect(ids(d)).toEqual([8000])
    expect(a.heard).toEqual([])
    await until(() => expect(a.statuses.at(-1)).not.toBe('SUBSCRIBED'))
    // The next batches, an update and a delete, go on without A's filter.
    await sql`update todos set title = 'renamed' where id = 8000`.execute(pg.db)
    // Heard first: an update whose row is deleted before its check is not sent.
    await until(() => expect(ids(b)).toEqual([8000, 8000]))
    await sql`delete from todos where id = 8000`.execute(pg.db)
    await until(() => expect(ids(b)).toEqual([8000, 8000, 8000]))
    expect(ids(d)).toEqual([8000, 8000, 8000])
    expect(a.heard).toEqual([])
  })
})
