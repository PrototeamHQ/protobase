import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import type { Server } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createAdaptorServer } from '@hono/node-server'
import { EncryptJWT, jwtDecrypt } from 'jose'
import { sql } from 'kysely'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles, f, resource } from '@protobase/schema'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import { captureSchemaSql } from '../src/changes/capture-schema-sql'
import { withAnonymous } from '../src/anonymous'
import { createAdmin } from '../src/create-admin'
import { jobsSchemaSql } from '../src/jobs/jobs-module'
import { liveTokenKey } from '../src/live/token/live-key'
import { startJobs, type JobsRuntime } from '../src/jobs/runtime'
import { relayClientEvents } from '../src/relay/client-events'
import { relaySchemaSql } from '../src/schema-modules/feature-schemas-sql'
import { subscription, type SubscriptionEvent } from '../src/webhooks/subscription'
import { npmWs } from './support/npm-ws'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'
import { realtimeBinary } from '../../../test-support/realtime-binary'

// The app's side of the realtime relay against a real relay process and real Postgres: tickets, change notices to a
// conversation's members, membership that follows the members table, open channels of public records only, and a
// sign-out closing that session's sockets, and presence the relay reports, kept in the app's own resource, raising its
// events and published to those who share a conversation, client events the config declares on a channel resource, and
// a person added to a conversation told alone which one, so their socket joins it.
// The relay is the Protobase Realtime release protobase dev runs (test-support/realtime-binary.ts).
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 })

const origin = 'http://localhost:5173'
const secret = 'relay-test-secret-relay-test-secret-1234'
const password = 'correct horse battery'
const keys = { apiKey: 'relay-test-api-key-0123456789abcdef', ticketKey: 'relay-test-ticket-key-0123456789abcd' }
const presenceKey = 'relay-test-presence-key-0123456789ab'

// A conversation declares `nudge`, and types as a conversation page with `typing` does.
const nudge = { schema: { type: 'object', properties: { to: { type: 'string' } }, required: ['to'] }, maxBytes: 128, perSecond: 5, burst: 5 }
const channels = { conversations: { members: { resource: 'conversation_members', channel: 'conversation_id', user: 'user_id' }, events: { nudge } }, rooms: {} }

const resources = [
  resource('conversations').table('conversations').fields({ id: f.integer().readOnly(), title: f.text() }).primaryKey((r) => r.id).live(),
  resource('conversation_members')
    .table('conversation_members')
    .fields({ id: f.integer().readOnly(), conversation_id: f.relation('conversations').filterable(), user_id: f.text().filterable() })
    .primaryKey((r) => r.id)
    .live(),
  resource('messages').table('messages').fields({ id: f.integer().readOnly(), conversation_id: f.relation('conversations').filterable(), body: f.text() }).primaryKey((r) => r.id).live(),
  resource('rooms').table('rooms').fields({ id: f.integer().readOnly(), name: f.text(), public: f.boolean().filterable() }).primaryKey((r) => r.id).live(),
  resource('posts').table('posts').fields({ id: f.integer().readOnly(), room_id: f.relation('rooms').filterable(), body: f.text() }).primaryKey((r) => r.id).live(),
  resource('presences')
    .table('presences')
    .fields({ user_id: f.text(), status: f.enum(['online', 'away', 'offline']), since: f.timestamp() })
    .primaryKey((r) => r.user_id)
    .live()
    .events((e) => [e.updated('wentOffline', { when: 'status = "offline"' })]),
]

// Signed-in people read every room, visitors only the public ones.
const roles = defineRoles<'rooms'>({ user: ['rooms.read'], anonymous: [{ 'rooms.read': { fields: ['id', 'name'], filter: 'public = true' } }] })

const tables = `
create table conversations (id integer generated always as identity primary key, title text not null);
create table conversation_members (id integer generated always as identity primary key, conversation_id integer not null references conversations, user_id text not null);
create index on conversation_members (conversation_id);
create index on conversation_members (user_id);
create table messages (id integer generated always as identity primary key, conversation_id integer not null references conversations, body text not null);
create table rooms (id integer generated always as identity primary key, name text not null, public boolean not null);
create index on rooms (public);
create table posts (id integer generated always as identity primary key, room_id integer not null references rooms, body text not null);
create table presences (user_id text primary key, status text not null, since timestamptz not null);
`

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })

type Frame = [string | null, string | null, string, string, Record<string, unknown>]

// A socket on the relay that keeps every frame it hears and how it closed.
const relaySocket = async (url: string, ticket: string) => {
  const socket = new npmWs.WebSocket(`${url}/websocket?vsn=2.0.0&ticket=${encodeURIComponent(ticket)}`)
  const frames: Frame[] = []
  let closed: number | undefined
  socket.on('message', (data) => frames.push(JSON.parse(String(data)) as Frame))
  socket.on('close', (code) => (closed = code))
  await new Promise((resolve, reject) => (socket.once('open', resolve), socket.once('error', reject)))
  let ref = 0
  const join = async (channel: string) => {
    const id = String(++ref)
    socket.send(JSON.stringify([id, id, channel, 'phx_join', {}]))
    await vi.waitFor(() => expect(frames.some((frame) => frame[1] === id)).toBe(true))
    return (frames.find((frame) => frame[1] === id)![4] as { status: string }).status
  }
  // Joins with a payload, such as a live query's token: `ok`, or the reason the relay refused it.
  const joinWith = async (channel: string, payload: Record<string, unknown>) => {
    const id = String(++ref)
    socket.send(JSON.stringify([id, id, channel, 'phx_join', payload]))
    await vi.waitFor(() => expect(frames.some((frame) => frame[1] === id)).toBe(true))
    const reply = frames.find((frame) => frame[1] === id)![4] as { status: string; response?: { reason?: string } }
    return reply.status === 'ok' ? 'ok' : reply.response?.reason
  }
  // Sends a client event on the channel: the relay's reply to it, `ok` or the reason it was refused.
  const send = async (channel: string, event: string, payload: unknown) => {
    const id = String(++ref)
    socket.send(JSON.stringify([null, id, channel, event, payload]))
    await vi.waitFor(() => expect(frames.some((frame) => frame[1] === id)).toBe(true))
    const reply = frames.find((frame) => frame[1] === id)![4] as { status: string; response?: { reason?: string } }
    return reply.status === 'ok' ? 'ok' : reply.response?.reason
  }
  const events = () => frames.filter((frame) => frame[3] === 'client_event').map((frame) => frame[4])
  const notices = () => frames.filter((frame) => frame[3] === 'change').map((frame) => frame[4])
  const presences = (user: string) => frames.filter((frame) => frame[2] === 'people' && frame[3] === 'presence_changed' && frame[4].user === user).map((frame) => frame[4].status)
  return { socket, frames, join, joinWith, send, events, notices, presences, closed: () => closed }
}

describe.skipIf(!(await postgresTemplateReady('auth')))('the realtime relay with a real relay', () => {
  let pg: PostgresDatabase
  let relay: ChildProcess
  let dir: string
  let app: ReturnType<typeof createAdmin>
  let server: Server
  let appUrl: string
  const wentOffline: SubscriptionEvent[] = []
  let runtime: JobsRuntime
  let relayUrl: string
  const errors: unknown[] = []
  const sockets: Awaited<ReturnType<typeof relaySocket>>[] = []
  const people: Record<'alice' | 'bob' | 'carol' | 'dave', string> = {} as never

  const request = (route: string, init: { body?: unknown; token?: string; cookie?: string } = {}) =>
    app.request(`${origin}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, ...(init.cookie && { cookie: init.cookie }), ...(init.token && { authorization: `Bearer ${init.token}` }) },
      body: JSON.stringify(init.body ?? {}),
    })

  // A new sign-in session of the person: its cookie, and the bearer token that names it.
  const signIn = async (email: string) => {
    const signedIn = await request('/api/auth/sign-in/email', { body: { email, password } })
    expect(signedIn.status).toBe(200)
    const cookie = signedIn.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
    const tokenAnswer = await app.request(`${origin}/api/auth/token`, { headers: { cookie, origin } })
    const { token } = (await tokenAnswer.json()) as { token: string }
    return { cookie, token }
  }

  const connect = async (token: string | undefined, channels: string[] = []) => {
    const answer = await request('/api/relay/ticket', { ...(token && { token }), body: { channels } })
    expect(answer.status).toBe(200)
    const { ticket, url } = (await answer.json()) as { ticket: string; url: string }
    const socket = await relaySocket(url, ticket)
    sockets.push(socket)
    return socket
  }

  const drained = async () => expect((await runtime.drain(20)).drained).toBe(true)

  beforeAll(async () => {
    pg = await openPostgresDatabase('auth')
    const auth = createAuth({ database: { dialect: pg.dialect, type: 'postgres' }, baseURL: origin, secret, mailer: false, signInPerMinute: 100 })
    await auth.$context
    for (const name of ['alice', 'bob', 'carol', 'dave'] as const) people[name] = String((await createUser(auth, { email: `${name}@example.com`, name, password })).id)
    await pg.exec(jobsSchemaSql())
    await pg.exec(tables)
    await pg.exec(captureSchemaSql(resources.map((entry) => entry.toModel())))
    await pg.exec(relaySchemaSql(auth, channels, resources.map((entry) => entry.toModel())))

    const port = await freePort()
    const appPort = await freePort()
    relayUrl = `http://127.0.0.1:${port}`
    appUrl = `http://127.0.0.1:${appPort}`
    dir = await mkdtemp(path.join(tmpdir(), 'relay-test-'))
    // No grace, so a closed socket is reported offline once that held for the relay's two seconds.
    const presence = { url: `${appUrl}/api/relay/presence`, key: presenceKey, grace_seconds: 0 }
    // A changes service at an address nothing serves: the relay answers a live join whose token it took with `ok`, and
    // keeps trying to connect to the service, which no test here needs.
    await writeFile(path.join(dir, 'changes.key'), randomBytes(32).toString('base64url'))
    const changes = [{ id: 'changes', url: `ws://127.0.0.1:${await freePort()}/relay`, key_file: path.join(dir, 'changes.key') }]
    await writeFile(path.join(dir, 'apps.json'), JSON.stringify({ changes, apps: [{ id: 'chat', api_keys: [keys.apiKey], ticket_keys: [keys.ticketKey], origins: [origin], client_events: relayClientEvents(channels, new Set(['conversations'])), presence, changes: 'changes', limits: { connections: 100, channels_per_ticket: 200, request_bytes: 65536 } }] }))
    relay = spawn(await realtimeBinary(), [], { env: { PROTOBASE_REALTIME_APPS_FILE: path.join(dir, 'apps.json'), PROTOBASE_REALTIME_ADDR: `127.0.0.1:${port}` }, stdio: 'ignore' })
    await vi.waitFor(async () => expect((await fetch(`${relayUrl}/apps/chat/sessions/close`, { method: 'POST' }).catch(() => undefined))?.status).toBe(401), { timeout: 10_000, interval: 100 })

    app = createAdmin({
      resources,
      db: pg.db,
      authenticate: withAnonymous(betterAuthAuthenticator({ auth }), roles),
      auth,
      realtime: {
        relay: {
          url: relayUrl,
          app: 'chat',
          ...keys,
          channels,
          presence: { resource: 'presences', user: 'user_id', status: 'status', at: 'since', key: presenceKey },
        },
      },
      subscriptions: [subscription('went_offline', { events: ['presences.wentOffline'], run: (event) => void wentOffline.push(event) })],
      options: { roles, onUnhandledError: (error) => errors.push(error) },
    })
    server = createAdaptorServer({ fetch: app.fetch }) as Server
    await new Promise<void>((resolve) => server.listen(appPort, '127.0.0.1', resolve))
    runtime = await startJobs({ db: pg.db, jobs: app.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => errors.push(error) })
    await sql`insert into rooms (name, public) values ('Lobby', true), ('Staff', false)`.execute(pg.db)
    await sql`insert into conversations (title) values ('Planning'), ('Lunch')`.execute(pg.db)
    await sql`insert into conversation_members (conversation_id, user_id) values (1, ${people.alice}), (1, ${people.bob}), (2, ${people.carol})`.execute(pg.db)
    await drained()
  })

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.socket.close()
  })

  afterAll(async () => {
    await runtime?.stop()
    relay?.kill()
    await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)))
    if (dir) await rm(dir, { recursive: true, force: true })
    await pg?.close()
    expect(errors).toEqual([])
  })

  it("notices a message to its conversation's members, and not to anyone else", async () => {
    const alice = await connect((await signIn('alice@example.com')).token)
    const bob = await connect((await signIn('bob@example.com')).token)
    const carol = await connect((await signIn('carol@example.com')).token)
    expect(await alice.join('conversations/1')).toBe('ok')
    expect(await bob.join('conversations/1')).toBe('ok')
    // Carol is in no list of the conversation's: the relay refuses her join.
    expect(await carol.join('conversations/1')).toBe('error')
    expect(await carol.join('conversations/2')).toBe('ok')
    // The answer lists the channels the ticket does, so a client joins them without reading the ticket.
    const answer = await request('/api/relay/ticket', { token: (await signIn('carol@example.com')).token })
    expect(((await answer.json()) as { channels: string[] }).channels).toEqual(['people', 'conversations/2'])

    const [{ id }] = (await sql<{ id: number }>`insert into messages (conversation_id, body) values (1, 'Hi') returning id`.execute(pg.db)).rows as [{ id: number }]
    await drained()
    const notice = { kind: 'create', resource: 'messages', key: String(id), channel: 'conversations/1' }
    await vi.waitFor(() => expect(alice.notices()).toEqual([notice]))
    await vi.waitFor(() => expect(bob.notices()).toEqual([notice]))
    expect(carol.notices()).toEqual([])
  })

  it('gives visitors and signed-in people the open channels of public records only, and notices them to everyone joined', async () => {
    const visitor = await connect(undefined, ['rooms/1'])
    expect(await visitor.join('rooms/1')).toBe('ok')
    // Bob may read the staff room, but it is not public: its channel is refused as for no record at all.
    const { token } = await signIn('bob@example.com')
    expect((await request('/api/relay/ticket', { token, body: { channels: ['rooms/2'] } })).status).toBe(404)
    expect((await request('/api/relay/ticket', { body: { channels: ['rooms/2'] } })).status).toBe(404)
    // A channel with members is never asked for.
    expect((await request('/api/relay/ticket', { token, body: { channels: ['conversations/1'] } })).status).toBe(404)

    const [{ id }] = (await sql<{ id: number }>`insert into posts (room_id, body) values (1, 'Welcome') returning id`.execute(pg.db)).rows as [{ id: number }]
    await drained()
    await vi.waitFor(() => expect(visitor.notices()).toEqual([{ kind: 'create', resource: 'posts', key: String(id), channel: 'rooms/1' }]))

    // While the lobby is not public, a socket that joined it hears nothing of it, and a new ticket is refused; notices
    // go in order, so the ones after it is public again, of that change and a post, show nothing came between.
    await sql`update rooms set public = false where id = 1`.execute(pg.db)
    await sql`insert into posts (room_id, body) values (1, 'Staff only')`.execute(pg.db)
    await drained()
    expect((await request('/api/relay/ticket', { body: { channels: ['rooms/1'] } })).status).toBe(404)
    await sql`update rooms set public = true where id = 1`.execute(pg.db)
    const [{ id: next }] = (await sql<{ id: number }>`insert into posts (room_id, body) values (1, 'Open again') returning id`.execute(pg.db)).rows as [{ id: number }]
    await drained()
    await vi.waitFor(() => expect(visitor.notices().map((notice) => `${notice.resource}/${notice.key}`)).toEqual([`posts/${id}`, 'rooms/1', `posts/${next}`]))
  })

  it('lets someone added to a conversation hear its next message without connecting again, and stops once they are removed', async () => {
    const carol = await connect((await signIn('carol@example.com')).token)
    expect(await carol.join('conversations/1')).toBe('error')

    await sql`insert into conversation_members (conversation_id, user_id) values (1, ${people.carol})`.execute(pg.db)
    await drained()
    await vi.waitFor(async () => expect(await carol.join('conversations/1')).toBe('ok'))
    await sql`insert into messages (conversation_id, body) values (1, 'Welcome')`.execute(pg.db)
    await drained()
    await vi.waitFor(() => expect(carol.notices().filter((notice) => notice.resource === 'messages')).toHaveLength(1))

    await sql`delete from conversation_members where conversation_id = 1 and user_id = ${people.carol}`.execute(pg.db)
    await drained()
    await vi.waitFor(() => expect(carol.frames.some((frame) => frame[2] === 'conversations/1' && frame[3] === 'phx_close')).toBe(true))
    await sql`insert into messages (conversation_id, body) values (1, 'After you left')`.execute(pg.db)
    await drained()
    // Bob hears it; by then the relay would have sent Carol hers too.
    const bob = await connect((await signIn('bob@example.com')).token)
    await bob.join('conversations/1')
    await sql`insert into messages (conversation_id, body) values (1, 'Once more')`.execute(pg.db)
    await drained()
    await vi.waitFor(() => expect(bob.notices()).toHaveLength(1))
    expect(carol.notices().filter((notice) => notice.resource === 'messages')).toHaveLength(1)
  })

  it('tells only the person added to a conversation which one, so their socket joins it and hears its next message', async () => {
    const carol = await connect((await signIn('carol@example.com')).token)
    const bob = await connect((await signIn('bob@example.com')).token)
    const dave = await connect((await signIn('dave@example.com')).token)
    for (const socket of [carol, bob, dave]) expect(await socket.join('people')).toBe('ok')
    const told = (socket: typeof carol) => socket.frames.filter((frame) => frame[2] === 'people' && frame[3] === 'joined').map((frame) => frame[4])

    await sql`insert into conversation_members (conversation_id, user_id) values (1, ${people.carol})`.execute(pg.db)
    await drained()
    await vi.waitFor(() => expect(told(carol)).toEqual([{ channel: 'conversations/1' }]))
    // As the client does on hearing it: join the channel it names.
    expect(await carol.join(told(carol)[0]!.channel as string)).toBe('ok')
    const [{ id }] = (await sql<{ id: number }>`insert into messages (conversation_id, body) values (1, 'Hi Carol') returning id`.execute(pg.db)).rows as [{ id: number }]
    await drained()
    await vi.waitFor(() => expect(carol.notices().filter((notice) => notice.resource === 'messages')).toEqual([{ kind: 'create', resource: 'messages', key: String(id), channel: 'conversations/1' }]))
    // Bob, already in it, and Dave, who is not, hear nothing of who joined.
    expect(told(bob)).toEqual([])
    expect(told(dave)).toEqual([])

    await sql`delete from conversation_members where conversation_id = 1 and user_id = ${people.carol}`.execute(pg.db)
    await drained()
  })

  it("closes the sockets of a session that signs out, and leaves the person's other sessions connected", async () => {
    const phone = await signIn('alice@example.com')
    const laptop = await signIn('alice@example.com')
    const onPhone = await connect(phone.token)
    const onLaptop = await connect(laptop.token)
    await onPhone.join('conversations/1')
    await onLaptop.join('conversations/1')

    expect((await request('/api/auth/sign-out', { cookie: phone.cookie })).status).toBe(200)
    await drained()
    await vi.waitFor(() => expect(onPhone.closed()).toBe(1000))
    await sql`insert into messages (conversation_id, body) values (1, 'Still here?')`.execute(pg.db)
    await drained()
    await vi.waitFor(() => expect(onLaptop.notices()).toHaveLength(1))
    expect(onLaptop.closed()).toBeUndefined()
    // A ticket for the ended session is refused.
    expect((await request('/api/relay/ticket', { token: phone.token })).status).toBeGreaterThanOrEqual(401)
  })

  it('keeps the presence the relay reports, raises the offline event once, and tells only those who share a conversation', async () => {
    const statusOf = async (user: string) => (await sql<{ status: string; since: Date }>`select status, since from presences where user_id = ${user}`.execute(pg.db)).rows[0]
    const bob = await connect((await signIn('bob@example.com')).token)
    const carol = await connect((await signIn('carol@example.com')).token)
    expect(await bob.join('people')).toBe('ok')
    expect(await carol.join('people')).toBe('ok')

    const alice = await connect((await signIn('alice@example.com')).token)
    await vi.waitFor(async () => expect((await statusOf(people.alice))?.status).toBe('online'), { timeout: 10_000, interval: 200 })
    await drained()
    const offlineBefore = wentOffline.filter((event) => event.data.key === people.alice).length

    alice.socket.close()
    await vi.waitFor(async () => expect((await statusOf(people.alice))?.status).toBe('offline'), { timeout: 10_000, interval: 200 })
    await drained()
    await vi.waitFor(() => expect(bob.presences(people.alice).at(-1)).toBe('offline'))
    expect(wentOffline.filter((event) => event.data.key === people.alice)).toHaveLength(offlineBefore + 1)

    // The relay sends a report again when it hears no answer: the same change changes nothing and raises nothing.
    const { since } = (await statusOf(people.alice))!
    const { started } = (await (await fetch(`${relayUrl}/health`)).json()) as { started: number }
    const again = await fetch(`${appUrl}/api/relay/presence`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${presenceKey}` },
      body: JSON.stringify({ started, changes: [{ user: people.alice, status: 'offline', at: since.getTime() }] }),
    })
    expect(again.status).toBe(204)
    await drained()
    expect(wentOffline.filter((event) => event.data.key === people.alice)).toHaveLength(offlineBefore + 1)
    // Carol shares no conversation with Alice: she hears none of her presence.
    expect(carol.presences(people.alice)).toEqual([])
    expect((await fetch(`${appUrl}/api/relay/presence`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(401)
    // A report with another key changes no one's presence.
    const forged = await fetch(`${appUrl}/api/relay/presence`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${keys.apiKey}` },
      body: JSON.stringify({ started, changes: [{ user: people.alice, status: 'online', at: since.getTime() + 60_000 }] }),
    })
    expect(forged.status).toBe(401)
    expect((await statusOf(people.alice))?.status).toBe('offline')
  })

  it("passes the events declared for a conversation to its other members' sockets, and refuses any other", async () => {
    const alice = await connect((await signIn('alice@example.com')).token)
    const bob = await connect((await signIn('bob@example.com')).token)
    expect(await alice.join('conversations/1')).toBe('ok')
    expect(await bob.join('conversations/1')).toBe('ok')

    expect(await alice.send('conversations/1', 'typing', { typing: true, thread: null })).toBe('ok')
    expect(await alice.send('conversations/1', 'nudge', { to: people.bob })).toBe('ok')
    await vi.waitFor(() => expect(bob.events().map((event) => [event.event, event.payload])).toEqual([['typing', { typing: true, thread: null }], ['nudge', { to: people.bob }]]))
    expect(bob.events()[0]).toMatchObject({ from: { user: people.alice }, channel: 'conversations/1' })

    expect(await alice.send('conversations/1', 'shout', {})).toBe('event_not_allowed')
    // Rooms declare no events: a typing page there would need its own declaration.
    const inRoom = await connect((await signIn('bob@example.com')).token, ['rooms/1'])
    expect(await inRoom.join('rooms/1')).toBe('ok')
    expect(await inRoom.send('rooms/1', 'typing', { typing: true, thread: null })).toBe('event_not_allowed')
    expect(await alice.send('conversations/1', 'typing', { typing: 'yes' })).toBe('invalid_payload')
    expect(alice.events()).toEqual([])
    expect(bob.events()).toHaveLength(2)
  })

  it('gives visitors no people channel: their ticket cannot ask for it and their socket cannot join it', async () => {
    expect((await request('/api/relay/ticket', { body: { channels: ['people'] } })).status).toBe(404)
    const visitor = await connect(undefined)
    expect(await visitor.join('people')).not.toBe('ok')
  })

  it("joins a live query with the token of a real read, and refuses one sealed with another key or expired", async () => {
    // Bob, as the user role reads rooms.
    const { token } = await signIn('bob@example.com')
    const bob = await connect(token)
    const read = await app.request(`${origin}/api/v1/rooms?limit=1`, { headers: { authorization: `Bearer ${token}`, prefer: 'live', origin } })
    expect(read.status).toBe(200)
    expect(read.headers.get('preference-applied')).toBe('live')
    const live = read.headers.get('protobase-live')!
    expect(await bob.joinWith('live:rooms', { live })).toBe('ok')

    // The same claims, sealed as the app seals them but with another ticket key's, or after their expiry.
    const { payload } = await jwtDecrypt(live, await liveTokenKey(keys.ticketKey))
    const seal = async (ticketKey: string, exp: number) =>
      new EncryptJWT({ ...payload }).setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'JWT' }).setExpirationTime(exp).encrypt(await liveTokenKey(ticketKey))
    const ahead = Math.floor(Date.now() / 1000) + 60
    expect(await bob.joinWith('live:other-key', { live: await seal('another-ticket-key-0123456789abcdef', ahead) })).toBe('invalid_live_token')
    expect(await bob.joinWith('live:expired', { live: await seal(keys.ticketKey, Math.floor(Date.now() / 1000) - 60) })).toBe('invalid_live_token')
    // Sealed again as it was, it is taken: the refusals came of the key and the expiry alone.
    expect(await bob.joinWith('live:resealed', { live: await seal(keys.ticketKey, ahead) })).toBe('ok')
  })
})
