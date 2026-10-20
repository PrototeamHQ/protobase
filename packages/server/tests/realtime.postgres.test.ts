import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createAdaptorServer, upgradeWebSocket } from '@hono/node-server'
import { createClient, type RealtimePostgresInsertPayload, type SupabaseClient } from '@supabase/supabase-js'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'
import { f, resource } from '@protobase/schema'
import { changesMigration, createAdmin, jwtVerifier, startJobs, type JobsRuntime } from '@protobase/server'
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

describe.skipIf(!(await postgresTemplateReady('jobs')))('Realtime postgres_changes with supabase-js', () => {
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

  // A client signed in as `sub`, listening to inserts into todos, with what it heard.
  const listen = async (sub: string) => {
    const token = await tokenOf(sub)
    const client = createClient(url, publishable, { accessToken: async () => token })
    clients.push(client)
    // Signed in before it subscribes: a channel joined in the same tick as createClient goes without the token.
    await client.realtime.setAuth(token)
    const heard: Insert[] = []
    await new Promise<void>((resolve, reject) => {
      client
        .channel(`todos-${sub}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'todos' }, (payload: Insert) => heard.push(payload))
        .subscribe((status, error) => {
          if (status === 'SUBSCRIBED') resolve()
          else if (status !== 'CLOSED') reject(error ?? new Error(status))
        })
    })
    return heard
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
})
