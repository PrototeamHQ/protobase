import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createAdaptorServer, upgradeWebSocket } from '@hono/node-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { f, resource, type AccessContext } from '@protobase/schema'
import { backgroundSettled, channelSendsMigration, createAdmin, defineFunction, realtimeRelayMigration } from '@protobase/server'
import { npmWs } from './support/npm-ws'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'

// The relays poll and the channels recheck on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

// A room is read by the members of its team alone: alice and bob are red, carol is blue.
const rooms = resource('rooms')
  .table('rooms')
  .fields({ id: f.integer().readOnly(), team: f.text() })
  .primaryKey((r) => r.id)
  .access({ read: ({ user }: AccessContext) => `team = "${user!.roles![0]}"`, list: () => true })

const teams: Record<string, string> = { alice: 'red', bob: 'red', carol: 'blue' }

const waitFor = (check: () => void, timeout = 10_000) => vi.waitFor(check, { timeout, interval: 50 })

describe.skipIf(!(await postgresTemplateReady('empty')))('Record channels on real Postgres, across two serving processes', () => {
  let pg: PostgresDatabase
  const servers: Server[] = []
  const sockets: InstanceType<typeof npmWs.WebSocket>[] = []
  const errors: unknown[] = []
  // The two processes' URLs.
  let a: string
  let b: string

  beforeAll(async () => {
    pg = await openPostgresDatabase('empty')
    await pg.exec(`create table rooms (id integer generated always as identity primary key, team text not null);
      insert into rooms (team) values ('red'), ('blue');`)
    await pg.exec((await realtimeRelayMigration(pg.db))!)
    await pg.exec((await channelSendsMigration(pg.db))!)
    const serve = async () => {
      const admin = createAdmin({
        resources: [rooms],
        db: pg.db,
        authenticate: (request) => {
          const user = request.headers.get('x-user')!
          return { user: { id: user, roles: [teams[user]!] } }
        },
        files: { storage: false },
        realtime: { processes: 'many', sqlSends: true },
        functions: {
          announce: defineFunction({ public: true }, async (_request, { channels: sender }) => {
            await sender.broadcast({ resource: 'rooms', key: '1', event: 'announcement', payload: { text: 'Standup' } })
            return new Response(null, { status: 204 })
          }),
        },
        options: { onUnhandledError: (error) => errors.push(error) },
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
    for (const socket of sockets) socket.close()
    // The relays' last writes, the leaves of the presences their channels tracked.
    await vi.waitFor(async () => expect((await pg.db.selectFrom('realtime_relay.processes').selectAll().execute()).length).toBe(0), { timeout: 5_000, interval: 50 })
    await backgroundSettled()
    for (const server of servers) await new Promise((resolve) => server.close(resolve))
    await pg?.close()
    expect(errors).toEqual([])
  })

  type Frame = Record<string, any>

  // A binary frame of `/api/channels`: its JSON header's 32-bit length, the header, the bytes.
  const binaryFrame = (header: Frame, bytes: number[]) => {
    const head = Buffer.from(JSON.stringify(header))
    const length = Buffer.alloc(4)
    length.writeUInt32BE(head.length)
    return Buffer.concat([length, head, Buffer.from(bytes)])
  }

  // The room's channel as the user, on the process at `url`, over the socket's own messages: what it was sent, a binary
  // frame as its header with its `bytes`, the presence it keeps from them, and the broadcasts it hears.
  const enter = async (url: string, user: string, key = 1) => {
    const socket = new npmWs.WebSocket(`${url.replace('http', 'ws')}/api/channels`, ['protobase.channels'], { headers: { 'x-user': user } })
    sockets.push(socket)
    const frames: Frame[] = []
    const presence = new Map<string, Frame>()
    socket.on('message', (data: Buffer, isBinary) => {
      const end = isBinary ? 4 + data.readUInt32BE(0) : 0
      const frame = (isBinary ? { ...JSON.parse(data.subarray(4, end).toString()), bytes: [...data.subarray(end)] } : JSON.parse(String(data))) as Frame
      frames.push(frame)
      if (frame.type === 'presence') for (const entry of frame.entries) presence.set(entry.id, entry)
      if (frame.type === 'presence_diff') {
        for (const entry of frame.leaves) presence.delete(entry.id)
        for (const entry of [...frame.joins, ...frame.updates]) presence.set(entry.id, entry)
      }
      if (frame.type === 'closed') presence.clear()
    })
    await new Promise((resolve) => socket.once('open', resolve))
    let ref = 0
    const request = async (message: Frame) => {
      const sent = String(++ref)
      socket.send(JSON.stringify({ ...message, ref: sent }))
      await waitFor(() => expect(frames.some((frame) => frame.type === 'reply' && frame.ref === sent)).toBe(true))
      return frames.find((frame) => frame.type === 'reply' && frame.ref === sent)!
    }
    const joined = await request({ type: 'join', resource: 'rooms', key: String(key) })
    const channel = 'rooms/' + String(key)
    return {
      joined,
      frames,
      request,
      // Each naming another user, which the server ignores for the session's.
      track: (state: unknown) => request({ type: 'track', channel, state, user: 'mallory' }),
      send: (event: string, payload: unknown) => request({ type: 'send', channel, event, payload, ack: true, user: 'mallory' }),
      // Bytes too, with a ref so the ack tells when the server took them.
      sendBytes: (event: string, bytes: number[]) => {
        const sent = String(++ref)
        socket.send(binaryFrame({ type: 'send', ref: sent, channel, event, ack: true }, bytes))
        return waitFor(() => expect(frames.some((frame) => frame.type === 'reply' && frame.ref === sent)).toBe(true))
      },
      heard: () => frames.filter((frame) => frame.type === 'broadcast').map(({ event, payload, bytes, user, server }) => ({ event, ...(bytes ? { bytes } : { payload }), user, ...(server && { server }) })),
      users: () => [...presence.values()].map((entry) => entry.user).sort(),
      presence: () => [...presence.values()],
    }
  }

  it('lets readers join on either process, and carries presence and broadcasts between them with the session\'s user', async () => {
    const alice = await enter(a, 'alice')
    const bob = await enter(b, 'bob')
    expect([alice.joined, bob.joined]).toMatchObject([{ ok: true, channel: 'rooms/1' }, { ok: true, channel: 'rooms/1' }])
    await alice.track({ status: 'online', user: 'carol' })
    await bob.track({ status: 'away' })
    await waitFor(() => expect(alice.users()).toEqual(['alice', 'bob']))
    await waitFor(() => expect(bob.users()).toEqual(['alice', 'bob']))
    expect(bob.presence().find((entry) => entry.user === 'alice')!.state).toEqual({ status: 'online', user: 'carol' })

    await alice.send('message', { text: 'Hi Bob', user: 'carol' })
    await waitFor(() => expect(bob.heard()).toEqual([{ event: 'message', payload: { text: 'Hi Bob', user: 'carol' }, user: 'alice' }]))
    expect(alice.heard()).toEqual([])

    expect((await fetch(`${a}/api/functions/announce`, { method: 'POST' })).status).toBe(204)
    const announcement = { event: 'announcement', payload: { text: 'Standup' }, user: null, server: true }
    await waitFor(() => expect(alice.heard()).toEqual([announcement]))
    await waitFor(() => expect(bob.heard().at(-1)).toEqual(announcement))

    await bob.request({ type: 'untrack', channel: 'rooms/1' })
    await waitFor(() => expect(alice.users()).toEqual(['alice']))
  })

  it('refuses a non-reader as for a record there is none of, who then sees no presence and hears no broadcast', async () => {
    const carol = await enter(b, 'carol', 2)
    const alice = await enter(a, 'alice', 2)
    const missing = await enter(a, 'alice', 99)
    expect(carol.joined).toMatchObject({ ok: true })
    const notFound = { code: 'not-found', message: 'There is no such record' }
    expect(alice.joined).toMatchObject({ ok: false, error: notFound })
    expect(missing.joined.error).toEqual(alice.joined.error)

    await carol.track({ status: 'online' })
    await carol.send('message', { text: 'blue only' })
    const refused = await fetch(`${a}/api/channels/rooms/2/broadcast`, { method: 'POST', headers: { 'x-user': 'alice', 'content-type': 'application/json' }, body: JSON.stringify({ event: 'message', payload: {} }) })
    expect(refused.status).toBe(404)
    const sent = await fetch(`${a}/api/channels/rooms/2/broadcast`, { method: 'POST', headers: { 'x-user': 'carol', 'content-type': 'application/json' }, body: JSON.stringify({ event: 'message', payload: { over: 'http' } }) })
    expect(sent.status).toBe(202)
    await waitFor(() => expect(carol.heard().at(-1)).toEqual({ event: 'message', payload: { over: 'http' }, user: 'carol' }))
    expect(alice.frames.filter((frame) => frame.type !== 'reply')).toEqual([])
  })

  it('stops a member who lost read access within the recheck bound, of presence and broadcasts both', async () => {
    const alice = await enter(a, 'alice', 1)
    const bob = await enter(b, 'bob', 1)
    await alice.track({ status: 'online' })
    await waitFor(() => expect(bob.users()).toContain('alice'))

    // Bob moves to the blue team: he may no longer read room 1.
    teams.bob = 'blue'
    const lost = Date.now()
    await waitFor(() => expect(bob.frames.at(-1)).toEqual({ type: 'closed', channel: 'rooms/1', error: { code: 'not-found', message: 'There is no such record' } }), 15_000)
    expect(Date.now() - lost).toBeLessThan(10_000 + 2_000)
    const heard = bob.frames.length
    await alice.send('message', { text: 'after' })
    await alice.track({ status: 'away' })
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(bob.frames.slice(heard)).toEqual([])
    teams.bob = 'red'
  })

  it('carries bytes between the processes, from a client and from the HTTP broadcast, with the sender\'s user', async () => {
    const alice = await enter(a, 'alice')
    const bob = await enter(b, 'bob')
    await alice.sendBytes('stroke', [0, 1, 128, 255])
    await waitFor(() => expect(bob.heard()).toEqual([{ event: 'stroke', bytes: [0, 1, 128, 255], user: 'alice' }]))
    expect(alice.heard()).toEqual([])

    const sent = await fetch(`${a}/api/channels/rooms/1/broadcast?event=chunk`, { method: 'POST', headers: { 'x-user': 'alice', 'content-type': 'application/octet-stream' }, body: new Uint8Array([9, 8, 7]) })
    expect(sent.status).toBe(202)
    await waitFor(() => expect(bob.heard().at(-1)).toEqual({ event: 'chunk', bytes: [9, 8, 7], user: 'alice' }))
    const refused = await fetch(`${a}/api/channels/rooms/1/broadcast?event=chunk`, { method: 'POST', headers: { 'x-user': 'carol', 'content-type': 'application/octet-stream' }, body: new Uint8Array([1]) })
    expect(refused.status).toBe(404)
  })

  it('broadcasts what SQL sends once its transaction commits, in order, as the server, on every process', async () => {
    const alice = await enter(a, 'alice')
    const bob = await enter(b, 'bob')
    await pg.exec(`begin; select channels.send('rooms', '1', 'announcement', '{"text":"rolled back"}'); rollback;`)
    await pg.exec(`begin; select channels.send('rooms', '1', 'announcement', '{"text":"x"}'); select channels.send('rooms', '01', 'announcement', '{"text":"y"}');
      select channels.send('rooms', '1', 'e', '"${'x'.repeat(256 * 1024)}"'); select channels.send('nothing', '1', 'e', '{}'); commit;`)
    const sent = [{ event: 'announcement', payload: { text: 'x' }, user: null, server: true }, { event: 'announcement', payload: { text: 'y' }, user: null, server: true }]
    await waitFor(() => expect(alice.heard()).toEqual(sent))
    await waitFor(() => expect(bob.heard()).toEqual(sent))
    expect((await pg.db.selectFrom('channels.sends').selectAll().execute()).length).toBe(0)
  })

  it('lets only the app\'s role call channels.send(), so no other role sends as the server', async () => {
    const role = `sends_outsider_${Date.now()}`
    await pg.exec(`create role ${role}; grant usage on schema channels to ${role}`)
    await expect(pg.exec(`set local role ${role}; select channels.send('rooms', '1', 'e', '{}')`)).rejects.toThrow('permission denied for function send')
    await pg.exec(`revoke usage on schema channels from ${role}; drop role ${role}`)
  })

  it('adds the space column to a relay schema written before the record channels', async () => {
    const old = await openPostgresDatabase('empty')
    await old.exec((await realtimeRelayMigration(old.db))!)
    await old.exec('alter table realtime_relay.frames drop column space; alter table realtime_relay.presences drop column space;')
    const migration = await realtimeRelayMigration(old.db)
    expect(migration).toBeDefined()
    await old.exec(migration!)
    expect(await realtimeRelayMigration(old.db)).toBeUndefined()
  })
})
