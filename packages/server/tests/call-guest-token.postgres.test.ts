import { upgradeWebSocket } from '@hono/node-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles, f, resource } from '@protobase/schema'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth } from '../src/better-auth/create-auth'
import { createOrganization } from '../src/better-auth/organizations/host'
import { createUser } from '../src/better-auth/users'
import { sqlCallStore } from '../src/calls/calls-store'
import { callsMigration } from '../src/calls/calls-sql'
import { sqlGuestStore } from '../src/calls/guest-store'
import { createAdmin } from '../src/create-admin'
import { defineFunction } from '../src/functions/define-function'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'

// The guest's token is no session: an admitted guest's token, sent to every route of an app with organizations, live
// records, channels, functions and calls, is refused by each but the guests' own, and gets no more than a request
// with no credential at all. The lobby is rate limited.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const origin = 'http://localhost:5173'
const secret = 'guest-token-test-secret-guest-token-test'
const password = 'correct horse battery'
const process = '11111111-1111-1111-1111-111111111111'

const meetings = resource('meetings')
  .table('meetings')
  .fields({ id: f.integer().readOnly(), org_id: f.text().readOnly(), title: f.text() })
  .primaryKey((r) => r.id)
  .tenant((r) => r.org_id)
  .search((r) => [r.title])
  .live()
// Visitors read nothing but are let in as the anonymous role: a bad credential must still be refused, never served as one.
const roles = defineRoles<'meetings'>({ admin: ['*'], member: ['meetings.read'], anonymous: [] })

describe.skipIf(!(await postgresTemplateReady('auth')))("a guest's token, on real Postgres", () => {
  let pg: PostgresDatabase
  let app: ReturnType<typeof createAdmin>
  let alice: string
  let organization: string
  let guestToken: string
  let linkToken: string

  const request = (path: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) =>
    app.request(`${origin}${path}`, {
      method: init.method ?? 'GET',
      headers: { origin, ...(init.body !== undefined && { 'content-type': 'application/json' }), ...init.headers },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    })
  const asGuest = (token = guestToken) => ({ authorization: `Bearer ${token}` })

  beforeAll(async () => {
    pg = await openPostgresDatabase('auth')
    const auth = createAuth({ database: { dialect: pg.dialect, type: 'postgres' }, baseURL: origin, secret, mailer: false, signInPerMinute: 100, organizations: { create: 'everyone' } })
    await auth.$context
    await createUser(auth, { email: 'alice@example.com', name: 'Alice', password })
    organization = String((await createOrganization(auth, { name: 'Acme', slug: 'acme', owner: 'alice@example.com' })).organization.id)
    await pg.exec(`create table meetings (id integer primary key, org_id text not null, title text not null); insert into meetings values (1, '${organization}', 'Interview');`)
    await pg.exec((await callsMigration(pg.db))!)
    const meeting = defineFunction(async (_request, { session, acceptWebSocket, calls }) =>
      acceptWebSocket(await calls.join({ record: { resource: 'meetings', key: 1 }, member: String(session.user.id), publish: true, invites: true })),
    )
    const ping = defineFunction(async () => Response.json({ pong: true }))
    app = createAdmin({ resources: [meetings], db: pg.db, authenticate: betterAuthAuthenticator({ auth }), auth, functions: { meeting, ping }, calls: { backend: { kind: 'peer' } }, upgradeWebSocket, options: { roles } })

    const signedIn = await request('/api/auth/sign-in/email', { method: 'POST', body: { email: 'alice@example.com', password } })
    alice = ((await signedIn.clone().json()) as { user: { id: string } }).user.id

    // Alice in the call on the meeting, with a guest link; Eve enters its lobby through the route and Alice lets her in.
    const calls = sqlCallStore(pg.db, 10_000)
    const guests = sqlGuestStore(pg.db, 10_000, async () => organization)
    const joined = await calls.admit({ record: { resource: 'meetings', key: '1' }, member: alice, process, maxMembers: 8, maxMinutes: 60 })
    if ('refused' in joined) throw new Error('Alice was refused')
    const made = await guests.createLink({ call: joined.call, member: alice, publish: ['microphone'] })
    if ('refused' in made) throw new Error('No link')
    linkToken = made.token
    const entered = await request('/api/calls/guests/lobby', { method: 'POST', headers: { 'x-forwarded-for': '10.0.0.1' }, body: { link: linkToken, name: 'Eve' } })
    expect(entered.status).toBe(201)
    const { guest, token } = (await entered.json()) as { guest: string; token: string }
    expect(await guests.decide({ call: joined.call, guest, member: alice, admit: true, maxMembers: 8 })).toEqual({})
    guestToken = token
    const admitted = await request('/api/calls/guests/lobby', { headers: { ...asGuest(), 'x-forwarded-for': '10.0.0.1' } })
    // Only the call's id and what Eve may send: nothing of the meeting, its organization or who let her in.
    expect(await admitted.json()).toEqual({ state: 'admitted', call: joined.call, publish: ['microphone'] })
  })

  afterAll(async () => {
    await pg?.close()
  })

  it('is refused by every documented route of the API, search included', async () => {
    const sessionCookie = (await request('/api/auth/sign-in/email', { method: 'POST', body: { email: 'alice@example.com', password } })).headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
    const { token: aliceToken } = (await (await request('/api/auth/token', { headers: { cookie: sessionCookie } })).json()) as { token: string }
    const document = (await (await request('/api/openapi.json', { headers: { authorization: `Bearer ${aliceToken}` } })).json()) as { paths: Record<string, Record<string, unknown> & { servers?: { url: string }[] }>; servers: { url: string }[] }
    const tried: string[] = []
    for (const [path, operations] of Object.entries(document.paths)) {
      // Each path is relative to its own server, or the document's, which are relative to the document itself.
      const server = operations.servers?.[0]?.url ?? document.servers[0]!.url
      const filled = new URL(`${server}${path.replace(/\{[^}]+\}/g, '1')}`, `${origin}/api/openapi.json`).pathname
      for (const method of Object.keys(operations).filter((name) => ['get', 'post', 'put', 'patch', 'delete'].includes(name))) {
        const answer = await request(filled, { method: method.toUpperCase(), headers: asGuest(), ...(method !== 'get' && method !== 'delete' && { body: {} }) })
        tried.push(`${method} ${filled}`)
        expect([401, 403], `${method} ${filled}`).toContain(answer.status)
      }
    }
    expect(tried).toEqual(expect.arrayContaining(['get /api/meta', 'get /api/v1/meetings', 'get /api/v1/meetings/1', 'post /api/v1/meetings:search', 'post /api/v1:batchWrite']))
  })

  it("is refused by the system routes, the live stream, channels, functions, rings, a record's calls, the members' call socket and the organization's switch", async () => {
    const upgrade = { upgrade: 'websocket', connection: 'Upgrade', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==' }
    const refused: [string, { method?: string; headers?: Record<string, string>; body?: unknown }][] = [
      ['/api/meta', { headers: asGuest() }],
      ['/api/openapi.json', { headers: asGuest() }],
      ['/api/docs', { headers: asGuest() }],
      ['/api/live', { headers: { ...asGuest(), accept: 'text/event-stream' } }],
      ['/api/channels', { headers: { ...asGuest(), ...upgrade } }],
      ['/api/channels', { headers: { ...upgrade, 'sec-websocket-protocol': `protobase-channels, bearer.${guestToken}` } }],
      ['/api/functions/ping', { headers: asGuest() }],
      ['/api/functions/ping', { method: 'POST', headers: asGuest(), body: {} }],
      ['/api/functions/meeting', { headers: { ...asGuest(), ...upgrade } }],
      ['/api/v1/meetings/1:calls', { headers: asGuest() }],
      ['/api/v1/meetings/1:calls?watch=true', { headers: asGuest() }],
      ['/api/calls/rings', { headers: asGuest() }],
      ['/api/calls/guests/organization', { headers: asGuest() }],
      ['/api/calls/guests/organization', { method: 'PUT', headers: asGuest(), body: { allowed: false } }],
      ['/api/sb/functions/v1/ping', { headers: { ...asGuest(), apikey: guestToken } }],
    ]
    for (const [path, init] of refused) expect([401, 403, 404], path).toContain((await request(path, init)).status)
    // Never a 404 that could hide a route the token got past: these are refused by who the caller is.
    for (const path of ['/api/meta', '/api/live', '/api/functions/ping', '/api/calls/rings', '/api/v1/meetings/1:calls']) expect((await request(path, { headers: asGuest() })).status, path).toBe(401)
    // The guests' switch still answers its organization, unchanged.
    expect((await sqlGuestStore(pg.db, 10_000, async () => organization).organizationAllowed(organization))).toBe(true)
  })

  it('gets no more than a request with no credential where one needs none, and no session', async () => {
    for (const path of ['/api/auth/status', '/api/manifest.webmanifest']) {
      const anonymous = await request(path)
      const guest = await request(path, { headers: asGuest() })
      expect(anonymous.status, path).toBe(200)
      // Refused, or answered as a request with no credential is: never as someone signed in.
      if (guest.status === 401) continue
      expect(guest.status, path).toBe(anonymous.status)
      expect(await guest.text(), path).toBe(await anonymous.text())
    }
    const session = await request('/api/auth/get-session', { headers: asGuest() })
    expect(await session.json()).toBeNull()
    expect(session.headers.getSetCookie()).toEqual([])
  })

  it("is the guest's own in the lobby only: the link's token is no guest's, and neither is any other", async () => {
    expect((await request('/api/calls/guests/lobby', { headers: { ...asGuest(linkToken), 'x-forwarded-for': '10.0.0.2' } })).status).toBe(401)
    expect((await request('/api/calls/guests/lobby', { headers: { ...asGuest(), 'x-forwarded-for': '10.0.0.2' } })).status).toBe(200)
  })

  it('rate limits the lobby by address: guessed links, then everything from that address, are refused', async () => {
    const from = { 'x-forwarded-for': '10.9.9.9' }
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) statuses.push((await request('/api/calls/guests/lobby', { method: 'POST', headers: from, body: { link: `pbgl_${'x'.repeat(43)}`, name: 'Mal' } })).status)
    expect(statuses).toEqual([404, 404, 404, 404, 404, 429])
    expect((await request('/api/calls/guests/lobby', { method: 'POST', headers: from, body: { link: linkToken, name: 'Mal' } })).status).toBe(429)
    expect((await request('/api/calls/guests/lobby', { method: 'POST', headers: { 'x-forwarded-for': '10.9.9.10' }, body: { link: linkToken, name: 'Mal' } })).status).toBe(201)
  })
})
