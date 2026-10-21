import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createAdaptorServer, upgradeWebSocket } from '@hono/node-server'
import { createClient, type RealtimeChannel, type RealtimePostgresInsertPayload, type SupabaseClient } from '@supabase/supabase-js'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest'
import { WebSocketServer } from 'ws'
import { f, resource } from '@protobase/schema'
import { betterAuthAuthenticator, changesMigration, createAdmin, createAuth, createUser, jwtVerifier, startJobs, type JobsRuntime } from '@protobase/server'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'

// The dispatch job and the notice feed poll on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const publishable = 'sb_publishable_realtime_test'
const issuer = 'https://app.example.com'

const todos = resource('todos')
  .table('todos')
  .fields({ id: f.integer().readOnly(), user_id: f.text(), title: f.text() })
  .primaryKey((r) => r.id)
  .live()

// Supabase's roles and auth.uid(), and an RLS policy that shows each user their own todos only.
const supabaseLike = `
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create function auth.uid() returns text language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
$f$;
grant usage on schema auth to anon, authenticated;
create table todos (id integer generated always as identity primary key, user_id text not null, title text not null);
alter table todos enable row level security;
create policy "own todos" on todos for select to authenticated using ((select auth.uid()) = user_id);
grant select on todos to anon, authenticated;
`

type Insert = RealtimePostgresInsertPayload<{ id: number; user_id: string; title: string }>

describe.skipIf(!(await postgresTemplateReady('jobs')))('Realtime with supabase-js', () => {
  let pg: PostgresDatabase
  let runtime: JobsRuntime
  let server: Server
  let url: string
  let tokenOf: (sub: string) => Promise<string>
  const clients: SupabaseClient[] = []
  const errors: unknown[] = []

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    await pg.exec(supabaseLike)
    await pg.exec((await changesMigration(pg.db, [todos.toModel()]))!)
    const pair = await generateKeyPair('ES256')
    const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), alg: 'ES256', kid: 'k1' }] })
    tokenOf = (sub) => new SignJWT({ sub, role: 'authenticated' }).setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setIssuer(issuer).setAudience(issuer).setExpirationTime('5m').sign(pair.privateKey)
    const admin = createAdmin({
      resources: [todos],
      db: pg.db,
      authenticate: () => ({ user: { id: 'admin', roles: ['admin'] } }),
      files: { storage: false },
      options: { apiKeys: { publishable_key: publishable }, onUnhandledError: (error) => errors.push(error) },
      verifyToken: jwtVerifier({ keys, issuer, audience: issuer }),
      upgradeWebSocket,
    })
    runtime = await startJobs({ db: pg.db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
    server = createAdaptorServer({ fetch: admin.fetch, websocket: { server: new WebSocketServer({ noServer: true }) } }) as Server
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

  // A client signed in as `sub`.
  const signIn = async (sub: string) => {
    const token = await tokenOf(sub)
    const client = createClient(`${url}/api/sb`, publishable, { accessToken: async () => token })
    clients.push(client)
    // Signed in before it subscribes: a channel joined in the same tick as createClient goes without the token.
    await client.realtime.setAuth(token)
    return client
  }

  const subscribed = (channel: RealtimeChannel) =>
    new Promise<void>((resolve, reject) => {
      channel.subscribe((status, error) => {
        if (status === 'SUBSCRIBED') resolve()
        else if (status !== 'CLOSED') reject(error ?? new Error(status))
      })
    })

  // A client signed in as `sub`, listening to inserts into todos, with what it heard.
  const listen = async (sub: string) => {
    const client = await signIn(sub)
    const heard: Insert[] = []
    await subscribed(client.channel(`todos-${sub}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'todos' }, (payload: Insert) => heard.push(payload)))
    return heard
  }

  // A client signed in as `sub` on the chat room, tracked under its name, with the broadcasts it heard.
  const enter = async (sub: string) => {
    const client = await signIn(sub)
    const heard: unknown[] = []
    const channel = client
      .channel('chat', { config: { broadcast: { ack: true }, presence: { key: sub } } })
      .on('broadcast', { event: 'message' }, ({ payload }) => heard.push(payload))
      .on('presence', { event: 'sync' }, () => {})
    await subscribed(channel)
    expect(await channel.track({ name: sub })).toBe('ok')
    return { channel, heard }
  }

  it('sends alice the insert of her row and not that of bob\'s, as her RLS policy says', async () => {
    const alice = await listen('alice')
    const bob = await listen('bob')
    await sql`insert into todos (user_id, title) values ('bob', 'Bob''s todo')`.execute(pg.db)
    await sql`insert into todos (user_id, title) values ('alice', 'Alice''s todo')`.execute(pg.db)
    await vi.waitFor(() => expect(alice).toHaveLength(1), { timeout: 20_000, interval: 50 })
    await vi.waitFor(() => expect(bob).toHaveLength(1), { timeout: 20_000, interval: 50 })
    expect(alice[0]).toMatchObject({ schema: 'public', table: 'todos', eventType: 'INSERT', new: { id: 2, user_id: 'alice', title: 'Alice\'s todo' } })
    expect(bob[0]).toMatchObject({ eventType: 'INSERT', new: { id: 1, user_id: 'bob' } })
  })

  it('lets alice and bob exchange broadcasts and see each other\'s presence', async () => {
    const alice = await enter('alice')
    const bob = await enter('bob')
    const names = (channel: RealtimeChannel) => Object.entries(channel.presenceState<{ name: string }>()).map(([key, presences]) => [key, presences.map(({ name }) => name)])
    await vi.waitFor(() => expect(names(alice.channel)).toEqual([['alice', ['alice']], ['bob', ['bob']]]), { timeout: 5_000, interval: 50 })
    await vi.waitFor(() => expect(names(bob.channel)).toEqual([['alice', ['alice']], ['bob', ['bob']]]), { timeout: 5_000, interval: 50 })

    expect(await alice.channel.send({ type: 'broadcast', event: 'message', payload: { text: 'Hi Bob' } })).toBe('ok')
    await vi.waitFor(() => expect(bob.heard).toEqual([{ text: 'Hi Bob' }]), { timeout: 5_000, interval: 50 })
    expect(alice.heard).toEqual([])

    expect(await bob.channel.untrack()).toBe('ok')
    await vi.waitFor(() => expect(names(alice.channel)).toEqual([['alice', ['alice']]]), { timeout: 5_000, interval: 50 })
  })
})

describe.skipIf(!(await postgresTemplateReady('jobs')) || !(await postgresTemplateReady('auth')))('Realtime with supabase-js signed in through /api/sb/auth/v1', () => {
  it('hears its own row\'s insert as its user, before and after it refreshes its token', async () => {
    const pg = await openPostgresDatabase('jobs')
    const store = await openPostgresDatabase('auth')
    await pg.exec(supabaseLike)
    await pg.exec((await changesMigration(pg.db, [todos.toModel()]))!)
    const auth = createAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: 'http://localhost:5173', secret: 'test-secret-test-secret-test-secret-1234', mailer: false })
    await createUser(auth, { email: 'ann@example.com', password: 'correct horse battery' })
    const errors: unknown[] = []
    const admin = createAdmin({ resources: [todos], db: pg.db, authenticate: betterAuthAuthenticator({ auth }), auth, files: { storage: false }, options: { apiKeys: { publishable_key: publishable }, onUnhandledError: (error) => errors.push(error) }, upgradeWebSocket })
    const runtime = await startJobs({ db: pg.db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
    onTestFinished(() => runtime.stop())
    const server = createAdaptorServer({ fetch: admin.fetch, websocket: { server: new WebSocketServer({ noServer: true }) } }) as Server
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    onTestFinished(() => new Promise<void>((resolve) => server.close(() => resolve())))

    const client = createClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sb`, publishable, { auth: { persistSession: false, autoRefreshToken: false } })
    onTestFinished(async () => void (await client.removeAllChannels()))
    const { data, error } = await client.auth.signInWithPassword({ email: 'ann@example.com', password: 'correct horse battery' })
    expect(error).toBeNull()
    const heard: Insert[] = []
    await new Promise<void>((resolve, reject) => {
      client
        .channel('todos')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'todos' }, (payload: Insert) => heard.push(payload))
        .subscribe((status, failure) => (status === 'SUBSCRIBED' ? resolve() : reject(failure ?? new Error(status))))
    })
    // Only a row of hers passes her RLS policy, so hearing one proves the channel runs as her.
    await sql`insert into todos (user_id, title) values (${data.user!.id}, 'Before')`.execute(pg.db)
    await vi.waitFor(() => expect(heard.map((payload) => payload.new.title)).toEqual(['Before']), { timeout: 20_000, interval: 50 })

    expect((await client.auth.refreshSession()).error).toBeNull()
    await sql`insert into todos (user_id, title) values (${data.user!.id}, 'After')`.execute(pg.db)
    await vi.waitFor(() => expect(heard.map((payload) => payload.new.title)).toEqual(['Before', 'After']), { timeout: 20_000, interval: 50 })
    expect(errors).toEqual([])
  })
})
