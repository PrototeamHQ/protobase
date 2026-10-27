import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createAdaptorServer, upgradeWebSocket } from '@hono/node-server'
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { backgroundSettled, createAdmin, jwtVerifier, realtimeRelayMigration } from '@protobase/server'
import { npmWs } from './support/npm-ws'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'

// The relays poll on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const publishable = 'sb_publishable_realtime_processes_test'
const issuer = 'https://app.example.com'

// Supabase's roles, auth.uid() and realtime.messages, whose policies let every signed-in user hear and send on any
// private channel.
const supabaseLike = `
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create function auth.uid() returns text language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '') $f$;
grant usage on schema auth to anon, authenticated;
create schema realtime;
create table realtime.messages (topic text not null, extension text not null, payload jsonb, event text, private boolean,
  updated_at timestamp not null default now(), inserted_at timestamp not null default now(), id uuid not null default gen_random_uuid() primary key);
create function realtime.topic() returns text language sql stable as $f$ select nullif(current_setting('realtime.topic', true), '')::text $f$;
alter table realtime.messages enable row level security;
grant usage on schema realtime to anon, authenticated;
grant select, insert on realtime.messages to anon, authenticated;
create policy "members hear" on realtime.messages for select to authenticated using (true);
create policy "members send" on realtime.messages for insert to authenticated with check (true);
`

const waitFor = (check: () => void) => vi.waitFor(check, { timeout: 10_000, interval: 50 })

describe.skipIf(!(await postgresTemplateReady('jobs')))('Realtime across two serving processes', () => {
  let pg: PostgresDatabase
  const servers: Server[] = []
  // The two processes' URLs.
  let a: string
  let b: string
  let tokenOf: (sub: string) => Promise<string>
  const clients: SupabaseClient[] = []
  const errors: unknown[] = []

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    await pg.exec(supabaseLike)
    await pg.exec((await realtimeRelayMigration(pg.db))!)
    const pair = await generateKeyPair('ES256')
    const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), alg: 'ES256', kid: 'k1' }] })
    tokenOf = (sub) => new SignJWT({ sub, role: 'authenticated' }).setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setIssuer(issuer).setAudience(issuer).setExpirationTime('5m').sign(pair.privateKey)
    const serve = async () => {
      const admin = createAdmin({
        resources: [],
        db: pg.db,
        authenticate: () => ({ user: { id: 'admin', roles: ['admin'] } }),
        files: { storage: false },
        realtime: { processes: 'many' },
        options: { apiKeys: { publishable_key: publishable }, onUnhandledError: (error) => errors.push(error) },
        verifyToken: jwtVerifier({ keys, issuer, audience: issuer }),
        upgradeWebSocket,
      })
      const server = createAdaptorServer({ fetch: admin.fetch, websocket: { server: new npmWs.WebSocketServer({ noServer: true }) } }) as Server
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      servers.push(server)
      return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    }
    a = await serve()
    b = await serve()
  })

  afterAll(async () => {
    for (const client of clients) await client.removeAllChannels()
    // The relays' last writes, the leaves of the presences their channels tracked.
    await vi.waitFor(async () => expect((await pg.db.selectFrom('realtime_relay.processes').selectAll().execute()).length).toBe(0), { timeout: 5_000, interval: 50 })
    await backgroundSettled()
    for (const server of servers) await new Promise((resolve) => server.close(resolve))
    await pg?.close()
    expect(errors).toEqual([])
  })

  const clientOf = async (url: string, sub: string) => {
    const token = await tokenOf(sub)
    const client = createClient(`${url}/api/sb`, publishable, { accessToken: async () => token })
    clients.push(client)
    await client.realtime.setAuth(token)
    return client
  }

  // A channel joined on the process at `url`, with the broadcasts it heard and the presence joins and leaves.
  const enter = async (url: string, sub: string, topic: string, isPrivate = false) => {
    const heard: unknown[] = []
    const joins: string[] = []
    const leaves: string[] = []
    const channel = (await clientOf(url, sub))
      .channel(topic, { config: { private: isPrivate, broadcast: { self: false }, presence: { key: sub } } })
      .on('broadcast', { event: 'message' }, ({ payload }) => heard.push(payload))
      .on('presence', { event: 'join' }, ({ key }) => joins.push(key))
      .on('presence', { event: 'leave' }, ({ key }) => leaves.push(key))
    const status = await new Promise<string>((resolve) => channel.subscribe((state) => state !== 'CLOSED' && resolve(state)))
    expect(status).toBe('SUBSCRIBED')
    return { channel, heard, joins, leaves }
  }

  const keys = (channel: RealtimeChannel) => Object.keys(channel.presenceState()).sort()

  const restBroadcast = async (url: string, messages: { topic: string; payload: unknown; private?: boolean }[]) =>
    fetch(`${url}/api/sb/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: publishable, authorization: `Bearer ${await tokenOf('alice')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messages: messages.map((message) => ({ event: 'message', private: false, ...message })) }),
    })

  it('carries broadcasts and presence between the channels of two processes, the presence tracked before the other joined included', async () => {
    const alice = await enter(a, 'alice', 'room')
    expect(await alice.channel.track({ online: true })).toBe('ok')
    const bob = await enter(b, 'bob', 'room')
    await waitFor(() => expect(keys(bob.channel)).toEqual(['alice']))
    expect(await bob.channel.track({ online: true })).toBe('ok')
    await waitFor(() => expect(keys(alice.channel)).toEqual(['alice', 'bob']))

    expect(await alice.channel.send({ type: 'broadcast', event: 'message', payload: { text: 'Hi Bob' } })).toBe('ok')
    expect(await bob.channel.send({ type: 'broadcast', event: 'message', payload: { text: 'Hi Alice', z: 1, a: 2 } })).toBe('ok')
    await waitFor(() => expect(bob.heard).toEqual([{ text: 'Hi Bob' }]))
    await waitFor(() => expect(alice.heard).toEqual([{ text: 'Hi Alice', z: 1, a: 2 }]))
    expect(Object.keys(alice.heard[0] as object)).toEqual(['text', 'z', 'a'])

    await bob.channel.untrack()
    await waitFor(() => expect(alice.leaves).toEqual(['bob']))
    await alice.channel.unsubscribe()
    // Bob hears his own leave too, as Phoenix Presence sends it.
    await waitFor(() => expect(bob.leaves).toEqual(['bob', 'alice']))
    expect(keys(bob.channel)).toEqual([])
  })

  it('keeps a topic\'s public and private channels apart across the processes, both ways', async () => {
    const publicOnA = await enter(a, 'alice', 'apart')
    const privateOnB = await enter(b, 'bob', 'apart', true)
    const privateOnA = await enter(a, 'carol', 'apart', true)
    const publicOnB = await enter(b, 'dave', 'apart')
    expect(await publicOnA.channel.track({ online: true })).toBe('ok')
    expect(await privateOnB.channel.track({ online: true })).toBe('ok')
    expect(await publicOnA.channel.send({ type: 'broadcast', event: 'message', payload: { from: 'public' } })).toBe('ok')
    expect(await privateOnB.channel.send({ type: 'broadcast', event: 'message', payload: { from: 'private' } })).toBe('ok')

    await waitFor(() => expect(publicOnB.heard).toEqual([{ from: 'public' }]))
    await waitFor(() => expect(privateOnA.heard).toEqual([{ from: 'private' }]))
    await waitFor(() => expect(keys(publicOnB.channel)).toEqual(['alice']))
    await waitFor(() => expect(keys(privateOnA.channel)).toEqual(['bob']))
    expect([privateOnB.heard, publicOnA.heard]).toEqual([[], []])
    expect([keys(privateOnB.channel), keys(publicOnA.channel)]).toEqual([['bob'], ['alice']])
  })

  it('carries a REST broadcast posted to one process to the other, a private one to its private channels only', async () => {
    const publicOnB = await enter(b, 'bob', 'posted')
    const privateOnB = await enter(b, 'carol', 'posted', true)
    expect((await restBroadcast(a, [{ topic: 'posted', payload: { to: 'public' } }])).status).toBe(202)
    expect((await restBroadcast(a, [{ topic: 'posted', payload: { to: 'private' }, private: true }])).status).toBe(202)
    await waitFor(() => expect(publicOnB.heard).toEqual([{ to: 'public' }]))
    await waitFor(() => expect(privateOnB.heard).toEqual([{ to: 'private' }]))
  })

  it('sends a broadcast from the database to a channel on each process, once each', async () => {
    const onA = await enter(a, 'alice', 'database')
    const onB = await enter(b, 'bob', 'database')
    await pg.exec(`insert into realtime.messages (topic, extension, event, payload, private) values ('database', 'broadcast', 'message', '{"n": 1}', false)`)
    await waitFor(() => expect([onA.heard, onB.heard]).toEqual([[{ n: 1 }], [{ n: 1 }]]))
    // A second message, after which a copy of the first would have arrived too.
    await pg.exec(`insert into realtime.messages (topic, extension, event, payload, private) values ('database', 'broadcast', 'message', '{"n": 2}', false)`)
    await waitFor(() => expect([onA.heard, onB.heard]).toEqual([[{ n: 1 }, { n: 2 }], [{ n: 1 }, { n: 2 }]]))
  })

  it('counts a topic\'s broadcasts per second across the processes', async () => {
    const statuses: number[] = []
    // A second may end between the two requests: then the second one fits, and the next try counts.
    for (const attempt of [1, 2, 3]) {
      const topic = `rate-${attempt}`
      const full = await restBroadcast(a, Array.from({ length: 100 }, (_, n) => ({ topic, payload: { n } })))
      const over = await restBroadcast(b, [{ topic, payload: { n: 100 } }])
      statuses.push(full.status, over.status)
      if (over.status === 429) break
    }
    expect(statuses.slice(-2)).toEqual([202, 429])
  })

  it('removes the presences of a process that stopped beating, with a leave on the other processes\' channels', async () => {
    const bob = await enter(b, 'bob', 'ghosts')
    const ghost = '00000000-0000-4000-8000-000000000001'
    const meta = JSON.stringify({ online: true, phx_ref: `${ghost}:1` })
    // A process that tracked a presence on its channel, and was killed a while ago.
    await pg.exec(`insert into realtime_relay.processes (id, seen_at) values ('${ghost}', now() - interval '1 hour');
      insert into realtime_relay.presences (process, ref, topic, private, key, meta) values ('${ghost}', '${ghost}:1', 'realtime:ghosts', false, 'ghost', '${meta}');
      insert into realtime_relay.frames (process, kind, topic, private, payload) values ('${ghost}', 'presence', 'realtime:ghosts', false, '{"joins": {"ghost": {"metas": [${meta}]}}, "leaves": {}}')`)
    await waitFor(() => expect(bob.joins).toEqual(['ghost']))
    await waitFor(() => expect(bob.leaves).toEqual(['ghost']))
    expect(keys(bob.channel)).toEqual([])
  })
})
