import { sql } from 'kysely'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth } from '../src/better-auth/create-auth'
import { addMember, createOrganization } from '../src/better-auth/organizations/host'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import { jobsSchemaMigration } from '../src/jobs/schema'
import { startJobs, type JobsRuntime } from '../src/jobs/runtime'
import { notificationsMigration } from '../src/notifications/schema'
import { sendNotification } from '../src/notifications/send-notification'
import type { PushSender } from '../src/notifications/sender'
import { onDoNotDisturb } from '../src/status/do-not-disturb'
import { statusNames } from '../src/status/options'
import { statusMigration } from '../src/status/schema'
import type { Authenticator } from '../src/types'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../../test-support/postgres-database'

// Status on real Postgres with Protobase's auth and organizations: who reads whose, who sets it, its clear time, and
// do not disturb holding a send's pushes, through the jobs runtime whose workers poll on real timers. Real scrypt
// hashing runs on this thread too.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 })

const origin = 'http://localhost:5173'
const secret = 'status-test-secret-status-test-secret-12'
const password = 'correct horse battery'

// The app's own sender, as an app's notifications/senders.ts gives it: it records the tokens of each batch it is handed.
const handed: string[] = []
const recordingSender: PushSender = {
  kinds: ['fcm'],
  send: async (_, devices) => {
    handed.push(...devices.map((device) => device.token))
    return devices.map((device) => ({ id: device.id, result: 'ok' }))
  },
}

describe.skipIf(!(await postgresTemplateReady('auth')))('status on real Postgres', () => {
  let pg: PostgresDatabase
  let auth: ReturnType<typeof createAuth>
  let app: ReturnType<typeof createAdmin>
  let runtime: JobsRuntime | undefined
  // Each person's bearer token and user id: Alice and Bob are in Acme, Carol only in Globex.
  const people: Record<'alice' | 'bob' | 'carol', { token: string; id: string }> = {} as never

  const request = (path: string, init: { method?: string; body?: unknown; token?: string; cookie?: string } = {}, target = app) =>
    target.request(`${origin}${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: { 'content-type': 'application/json', origin, ...(init.cookie && { cookie: init.cookie }), ...(init.token && { authorization: `Bearer ${init.token}` }) },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    })
  const as = (who: keyof typeof people) => ({ token: people[who].token })
  const statusesOf = async (who: keyof typeof people) => ((await (await request('/api/status/people', as(who))).json()) as { statuses: { userId: string; text: string | null }[] }).statuses
  const setStatus = (who: keyof typeof people, body: unknown) => request('/api/status', { ...as(who), method: 'PUT', body })

  beforeAll(async () => {
    pg = await openPostgresDatabase('auth')
    auth = createAuth({ database: { dialect: pg.dialect, type: 'postgres' }, baseURL: origin, secret, mailer: false, signInPerMinute: 100, organizations: { create: 'everyone' } })
    await auth.$context
    for (const name of ['alice', 'bob', 'carol']) await createUser(auth, { email: `${name}@example.com`, name, password })
    await createOrganization(auth, { name: 'Acme', slug: 'acme', owner: 'alice@example.com' })
    await addMember(auth, { organization: 'acme', email: 'bob@example.com' })
    await createOrganization(auth, { name: 'Globex', slug: 'globex', owner: 'carol@example.com' })
    await pg.exec((await jobsSchemaMigration(pg.db))!)
    await pg.exec((await notificationsMigration(pg.db, {}, auth))!)
    await pg.exec((await statusMigration(pg.db, {}, auth))!)
    app = createAdmin({ resources: [], db: pg.db, authenticate: betterAuthAuthenticator({ auth }), auth, notifications: { senders: [recordingSender] }, status: {} })
    for (const name of ['alice', 'bob', 'carol'] as const) {
      const signedIn = await request('/api/auth/sign-in/email', { body: { email: `${name}@example.com`, password } })
      expect(signedIn.status).toBe(200)
      const cookie = signedIn.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
      const { token } = (await (await request('/api/auth/token', { cookie })).json()) as { token: string }
      const { user } = (await signedIn.clone().json()) as { user: { id: string } }
      people[name] = { token, id: user.id }
      // A phone of each, registered in the session it signed in with, so the device gets push while that session stands.
      expect((await request('/api/notifications/devices', { token, body: { kind: 'fcm', token: `${name}-phone` } })).status).toBe(200)
    }
  })

  afterEach(async () => {
    await runtime?.stop()
    runtime = undefined
    handed.length = 0
    await sql`delete from status.statuses`.execute(pg.db)
  })

  afterAll(async () => {
    await pg?.close()
  })

  it('shows a status to the members of an organization the person is in, and to no one else', async () => {
    expect((await setStatus('alice', { availability: 'busy', text: 'Having lunch', clearsAt: null })).status).toBe(200)
    const lunch = { userId: people.alice.id, availability: 'busy', text: 'Having lunch', clearsAt: null }
    expect(await statusesOf('bob')).toEqual([lunch])
    expect(await statusesOf('alice')).toEqual([lunch])
    // Carol shares no organization with Alice: she is answered as for someone she cannot see.
    expect(await statusesOf('carol')).toEqual([])
    // A visitor, signed in as no one, gets nothing.
    const visitor = await request('/api/status/people')
    expect(visitor.status).toBe(401)
    expect(await visitor.text()).not.toContain('Having lunch')
  })

  it("shows a person's one status in every organization they are in", async () => {
    await addMember(auth, { organization: 'globex', email: 'bob@example.com' })
    await setStatus('bob', { availability: 'automatic', text: 'On vacation 🌴', clearsAt: null })
    expect((await statusesOf('carol')).map((status) => status.text)).toEqual(['On vacation 🌴'])
    expect((await statusesOf('alice')).map((status) => status.text)).toEqual(['On vacation 🌴'])
  })

  it('sets only the status of the person signed in, whatever person the request names', async () => {
    const naming = await setStatus('alice', { availability: 'do_not_disturb', text: null, clearsAt: null, userId: people.bob.id })
    expect(naming.status).toBe(400)
    expect((await request(`/api/status/people/${people.bob.id}`, { ...as('alice'), method: 'PUT', body: { availability: 'busy', text: null, clearsAt: null } })).status).toBe(404)
    expect(await statusesOf('bob')).toEqual([])
    // Staff signed in as Alice cannot set hers.
    const staff: Authenticator = () => ({ user: { id: people.alice.id, roles: ['user'] }, signIn: { session: 'staff-session', staff: true } })
    const asStaff = createAdmin({ resources: [], db: pg.db, authenticate: staff, auth, status: {} })
    const refused = await request('/api/status', { method: 'PUT', body: { availability: 'busy', text: null, clearsAt: null } }, asStaff)
    expect(refused.status).toBe(403)
    expect(await statusesOf('bob')).toEqual([])
    // Clearing reaches the caller's own alone.
    await setStatus('bob', { availability: 'busy', text: null, clearsAt: null })
    expect((await request('/api/status', { ...as('alice'), method: 'DELETE' })).status).toBe(204)
    expect((await statusesOf('alice')).map((status) => status.userId)).toEqual([people.bob.id])
  })

  it('refuses a text over the limit or with control characters, saying why', async () => {
    const long = await setStatus('alice', { availability: 'busy', text: 'a'.repeat(101), clearsAt: null })
    expect(long.status).toBe(400)
    expect(((await long.json()) as { detail: string }).detail).toBe('A status is at most 100 characters')
    expect((await setStatus('alice', { availability: 'busy', text: 'a\u0007b', clearsAt: null })).status).toBe(400)
    expect(await statusesOf('alice')).toEqual([])
  })

  it('reads a status past its clear time as none, and do not disturb past it no longer holds pushes', async () => {
    const set = await setStatus('alice', { availability: 'do_not_disturb', text: 'Focus', clearsAt: new Date(Date.now() + 60_000).toISOString() })
    expect(((await set.json()) as { status: { text: string } }).status.text).toBe('Focus')
    expect(await onDoNotDisturb(pg.db, statusNames(), [people.alice.id, people.bob.id])).toEqual(new Set([people.alice.id]))
    await sql`update status.statuses set clears_at = now() - interval '1 second'`.execute(pg.db)
    expect(await statusesOf('bob')).toEqual([])
    expect(((await (await request('/api/status', as('alice'))).json()) as { status: unknown }).status).toBeNull()
    expect(await onDoNotDisturb(pg.db, statusNames(), [people.alice.id])).toEqual(new Set())
    runtime = await startJobs({ db: pg.db, jobs: app.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => { throw error } })
    await sendNotification(pg.db, { userIds: [people.alice.id], inbox: false }, { title: 'Ping' })
    expect((await runtime.drain(20)).drained).toBe(true)
    expect(handed).toEqual(['alice-phone'])
  })

  it("keeps a send in everyone's history, pushes to no device of someone on do not disturb, and to them again once it is cleared", async () => {
    await setStatus('alice', { availability: 'do_not_disturb', text: null, clearsAt: null })
    runtime = await startJobs({ db: pg.db, jobs: app.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => { throw error } })
    await sendNotification(pg.db, { userIds: [people.alice.id, people.bob.id], inbox: true }, { title: 'Standup' })
    expect((await runtime.drain(20)).drained).toBe(true)
    expect(handed).toEqual(['bob-phone'])
    for (const who of ['alice', 'bob'] as const) {
      expect(((await (await request('/api/notifications/history/unread', as(who))).json()) as { count: number }).count).toBe(1)
    }
    // Clearing do not disturb pushes nothing of the earlier send; the next send reaches both.
    await request('/api/status', { ...as('alice'), method: 'DELETE' })
    await sendNotification(pg.db, { userIds: [people.alice.id, people.bob.id], inbox: true }, { title: 'Lunch' })
    expect((await runtime.drain(20)).drained).toBe(true)
    expect(handed).toEqual(['bob-phone', 'alice-phone', 'bob-phone'])
  })

  it('a busy status holds no push', async () => {
    await setStatus('alice', { availability: 'busy', text: null, clearsAt: null })
    runtime = await startJobs({ db: pg.db, jobs: app.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => { throw error } })
    await sendNotification(pg.db, { userIds: [people.alice.id], inbox: false }, { title: 'Ping' })
    expect((await runtime.drain(20)).drained).toBe(true)
    expect(handed).toEqual(['alice-phone'])
  })

  it('without status, the app has no endpoint and no table to write, and sends reach everyone', async () => {
    const without = createAdmin({ resources: [], db: pg.db, authenticate: betterAuthAuthenticator({ auth }), auth, notifications: { senders: [recordingSender] } })
    expect((await request('/api/status/people', as('bob'), without)).status).toBe(404)
    expect((await request('/api/status', { ...as('bob'), method: 'PUT', body: { availability: 'busy', text: null, clearsAt: null } }, without)).status).toBe(404)
    expect(((await (await request('/api/meta', as('bob'), without)).json()) as { status?: true }).status).toBeUndefined()
    // Alice's do not disturb, left in the table, is nothing to an app without status.
    await setStatus('alice', { availability: 'do_not_disturb', text: null, clearsAt: null })
    runtime = await startJobs({ db: pg.db, jobs: without.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => { throw error } })
    await sendNotification(pg.db, { userIds: [people.alice.id, people.bob.id], inbox: false }, { title: 'Ping' })
    expect((await runtime.drain(20)).drained).toBe(true)
    expect(handed).toEqual(['alice-phone', 'bob-phone'])
  })

})
