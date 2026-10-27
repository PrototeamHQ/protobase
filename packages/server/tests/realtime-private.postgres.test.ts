import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createAdaptorServer, upgradeWebSocket } from '@hono/node-server'
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAdmin, jwtVerifier } from '@protobase/server'
import { npmWs } from './support/npm-ws'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const publishable = 'sb_publishable_realtime_private_test'
const issuer = 'https://app.example.com'

// Supabase's roles, auth.uid() and realtime.messages with realtime.topic(), and policies as a Supabase app writes them:
// alice and bob may hear the room, alice alone may send there, and no one may hear any other topic.
const supabaseLike = `
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create function auth.uid() returns text language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '') $f$;
grant usage on schema auth to anon, authenticated;
create schema realtime;
create table realtime.messages (topic text not null, extension text not null, payload jsonb, event text, private boolean,
  updated_at timestamp not null default now(), inserted_at timestamp not null default now(), id uuid not null default gen_random_uuid(), primary key (id, inserted_at));
create function realtime.topic() returns text language sql stable as $f$ select nullif(current_setting('realtime.topic', true), '')::text $f$;
alter table realtime.messages enable row level security;
grant usage on schema realtime to anon, authenticated;
grant select, insert on realtime.messages to anon, authenticated;
create policy "members hear the room" on realtime.messages for select to authenticated
  using (realtime.topic() = 'room' and (select auth.uid()) in ('alice', 'bob'));
create policy "alice sends to the room" on realtime.messages for insert to authenticated
  with check (realtime.topic() = 'room' and (select auth.uid()) = 'alice');
`

describe.skipIf(!(await postgresTemplateReady('jobs')))('Private Realtime channels with supabase-js', () => {
  let pg: PostgresDatabase
  let server: Server
  let url: string
  let tokenOf: (sub: string) => Promise<string>
  const clients: SupabaseClient[] = []
  const errors: unknown[] = []

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    await pg.exec(supabaseLike)
    const pair = await generateKeyPair('ES256')
    const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), alg: 'ES256', kid: 'k1' }] })
    tokenOf = (sub) => new SignJWT({ sub, role: 'authenticated' }).setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setIssuer(issuer).setAudience(issuer).setExpirationTime('5m').sign(pair.privateKey)
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

  // A client signed in as `sub`, or with the publishable key alone.
  const clientOf = async (sub?: string) => {
    const token = sub === undefined ? undefined : await tokenOf(sub)
    const client = createClient(`${url}/api/sb`, publishable, token === undefined ? {} : { accessToken: async () => token })
    clients.push(client)
    if (token !== undefined) await client.realtime.setAuth(token)
    return client
  }

  // The private channel's status once it joins or is refused, with the broadcasts and presence keys it heard.
  const enter = async (sub: string | undefined, topic = 'room') => {
    const client = await clientOf(sub)
    const heard: unknown[] = []
    const channel = client
      .channel(topic, { config: { private: true, broadcast: { ack: true }, presence: { key: sub ?? 'anon' } } })
      .on('broadcast', { event: 'message' }, ({ payload }) => heard.push(payload))
      .on('presence', { event: 'sync' }, () => {})
    const joined = await new Promise<{ status: string; error?: Error }>((resolve) => channel.subscribe((status, error) => status !== 'CLOSED' && resolve({ status, error })))
    return { channel, heard, joined }
  }

  const keys = (channel: RealtimeChannel) => Object.keys(channel.presenceState()).sort()

  it('lets the members join, hear broadcasts and presence, and refuses the others and other topics', async () => {
    const alice = await enter('alice')
    const bob = await enter('bob')
    expect([alice.joined.status, bob.joined.status]).toEqual(['SUBSCRIBED', 'SUBSCRIBED'])

    const refused = [await enter('carol'), await enter(undefined), await enter('alice', 'elsewhere')]
    expect(refused.map(({ joined }) => [joined.status, joined.error?.message])).toEqual([
      ['CHANNEL_ERROR', 'Unauthorized: You do not have permissions to read from this Channel topic: room'],
      ['CHANNEL_ERROR', 'Unauthorized: You do not have permissions to read from this Channel topic: room'],
      ['CHANNEL_ERROR', 'Unauthorized: You do not have permissions to read from this Channel topic: elsewhere'],
    ])

    expect(await alice.channel.track({ online: true })).toBe('ok')
    await vi.waitFor(() => expect(keys(bob.channel)).toEqual(['alice']), { timeout: 5_000, interval: 50 })
    expect(await alice.channel.send({ type: 'broadcast', event: 'message', payload: { text: 'Hi Bob' } })).toBe('ok')
    await vi.waitFor(() => expect(bob.heard).toEqual([{ text: 'Hi Bob' }]), { timeout: 5_000, interval: 50 })
  })

  it('refuses a broadcast and a track from a member the policies let hear but not send, and relays neither', async () => {
    const alice = await enter('alice')
    const bob = await enter('bob')
    expect(await bob.channel.send({ type: 'broadcast', event: 'message', payload: { text: 'Hi Alice' } })).toBe('error')
    expect(await bob.channel.track({ online: true })).toBe('error')
    // Bob's broadcast would have reached Alice before his reply, so hearing nothing proves it went to no one.
    expect(await alice.channel.send({ type: 'broadcast', event: 'message', payload: { text: 'After' } })).toBe('ok')
    await vi.waitFor(() => expect(bob.heard).toEqual([{ text: 'After' }]), { timeout: 5_000, interval: 50 })
    expect(alice.heard).toEqual([])
    expect(keys(alice.channel)).not.toContain('bob')
  })
})
