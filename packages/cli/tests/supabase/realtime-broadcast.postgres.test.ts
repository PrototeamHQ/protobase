import type { Server } from 'node:http'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { createAdaptorServer, upgradeWebSocket } from '@hono/node-server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAdmin, jwtVerifier } from '@protobase/server'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../../test-support/postgres-database'
import { realtimeMigration } from '../../src/supabase/realtime-policies'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

// npm `ws`, loaded by its path: on Bun a bare `ws` import is Bun's own shim, whose sockets realtime refuses.
const require = createRequire(import.meta.url)
const npmWs: typeof import('ws') = require(path.join(path.dirname(require.resolve('ws/package.json')), 'index.js'))

const publishable = 'sb_publishable_realtime_broadcast_test'
const issuer = 'https://app.example.com'

// Supabase's roles and auth.uid(), then the realtime schema as the import writes it, with a policy that lets alice hear
// the todos and the secret topic, and a trigger as Supabase's docs write one for broadcast_changes().
const roles = `
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
create schema auth;
create function auth.uid() returns text language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '') $f$;
grant usage on schema auth to anon, authenticated;
`
const migration = realtimeMigration([
  { name: 'alice hears', permissive: true, roles: ['authenticated'], command: 'SELECT', using: "realtime.topic() in ('todos', 'secret') and (select auth.uid()) = 'alice'", withCheck: null },
])
const app = `
create table public.todos (id int primary key, title text not null);
create function public.todos_broadcast() returns trigger security definer language plpgsql as $f$
begin
  perform realtime.broadcast_changes('todos', tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  return null;
end
$f$;
create trigger todos_broadcast after insert or update or delete on public.todos for each row execute function public.todos_broadcast();
`

type Heard = { event: string; payload: Record<string, unknown>; meta?: { id: string } }

describe.skipIf(!(await postgresTemplateReady('jobs')))('Broadcast from the database with supabase-js', () => {
  let pg: PostgresDatabase
  let server: Server
  let url: string
  let alice: string
  const clients: SupabaseClient[] = []
  const errors: unknown[] = []

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    await pg.exec(roles + migration + app)
    const pair = await generateKeyPair('ES256')
    const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), alg: 'ES256', kid: 'k1' }] })
    alice = await new SignJWT({ sub: 'alice', role: 'authenticated' }).setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setIssuer(issuer).setAudience(issuer).setExpirationTime('5m').sign(pair.privateKey)
    const admin = createAdmin({
      resources: [],
      db: pg.db,
      authenticate: () => ({ user: { id: 'admin', roles: ['admin'] } }),
      files: { storage: false },
      options: { apiKeys: { publishable_key: publishable }, onUnhandledError: (error) => errors.push(error) },
      verifyToken: jwtVerifier({ keys, issuer, audience: issuer }),
      upgradeWebSocket,
    })
    server = createAdaptorServer({ fetch: admin.fetch, websocket: { server: new npmWs.WebSocketServer({ noServer: true }) } }) as Server
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    for (const client of clients) await client.removeAllChannels()
    if (server) await new Promise((resolve) => server.close(resolve))
    await pg?.close()
    expect(errors).toEqual([])
  })

  // A channel on the topic, signed in as alice when private, joined, with every broadcast it hears.
  const listen = async (topic: string, isPrivate: boolean) => {
    const client = createClient(`${url}/api/sb`, publishable, isPrivate ? { accessToken: async () => alice } : {})
    clients.push(client)
    if (isPrivate) await client.realtime.setAuth(alice)
    const heard: Heard[] = []
    const channel = client.channel(topic, { config: { private: isPrivate } }).on('broadcast', { event: '*' }, ({ event, payload, meta }) => heard.push({ event, payload, meta }))
    const status = await new Promise<string>((resolve) => channel.subscribe((joined) => joined !== 'CLOSED' && resolve(joined)))
    expect(status).toBe('SUBSCRIBED')
    return heard
  }

  it('delivers a trigger\'s broadcast_changes() of an insert, update and delete in Supabase\'s payload shape, in order', async () => {
    const heard = await listen('todos', true)
    await pg.exec(`begin; insert into public.todos values (1, 'Write'); update public.todos set title = 'Ship' where id = 1; commit;`)
    await pg.exec('delete from public.todos where id = 1')
    await vi.waitFor(() => expect(heard).toHaveLength(3), { timeout: 5_000, interval: 50 })
    const changes = { table: 'todos', schema: 'public' }
    expect(heard).toEqual([
      { event: 'INSERT', payload: { ...changes, operation: 'INSERT', record: { id: 1, title: 'Write' }, old_record: null, id: expect.any(String) }, meta: { id: expect.any(String) } },
      { event: 'UPDATE', payload: { ...changes, operation: 'UPDATE', record: { id: 1, title: 'Ship' }, old_record: { id: 1, title: 'Write' }, id: expect.any(String) }, meta: { id: expect.any(String) } },
      { event: 'DELETE', payload: { ...changes, operation: 'DELETE', record: null, old_record: { id: 1, title: 'Ship' }, id: expect.any(String) }, meta: { id: expect.any(String) } },
    ])
    expect(heard.map(({ payload, meta }) => payload.id === meta?.id)).toEqual([true, true, true])
  })

  it('delivers realtime.send() from plain SQL to the public channels, and nothing of a transaction rolled back', async () => {
    const heard = await listen('room', false)
    await pg.exec(`begin; select realtime.send('{"text": "Rolled back"}', 'message', 'room', false); rollback;`)
    await pg.exec(`select realtime.send('{"text": "Hi", "id": "mine"}', 'message', 'room', false)`)
    await vi.waitFor(() => expect(heard).toHaveLength(1), { timeout: 5_000, interval: 50 })
    expect(heard).toEqual([{ event: 'message', payload: { text: 'Hi', id: 'mine' }, meta: { id: expect.any(String) } }])
  })

  it('delivers a private message only to the private channels the policies let hear it', async () => {
    const privately = await listen('secret', true)
    const publicly = await listen('secret', false)
    await pg.exec(`select realtime.send('{"text": "Private"}', 'message', 'secret')`)
    await pg.exec(`select realtime.send('{"text": "Public"}', 'message', 'secret', false)`)
    await vi.waitFor(() => expect(publicly).toHaveLength(1), { timeout: 5_000, interval: 50 })
    expect(privately.map(({ payload }) => payload.text)).toEqual(['Private'])
    expect(publicly.map(({ payload }) => payload.text)).toEqual(['Public'])
  })
})
