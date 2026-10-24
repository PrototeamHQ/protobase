import { describe, expect, it, vi } from 'vitest'
import { authSchemaMigration } from '../src/better-auth/auth-schema'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth } from '../src/better-auth/create-auth'
import { issueToken } from '../src/better-auth/tokens'
import { createUser, deleteUser } from '../src/better-auth/users'
import type { UserTableOptions } from '../src/better-auth/user-table'
import { createAdmin } from '../src/create-admin'
import type { DeviceStore } from '../src/notifications/device-store'
import { devicesPath } from '../src/notifications/paths'
import { checkNotificationsSchema, notificationsMigration } from '../src/notifications/schema'
import { memoryDeviceStore } from '../src/notifications/testing/memory-store'
import { openSnapshotDb, settled } from '../../../test-support/sql-snapshot'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'
const password = 'correct horse battery'
const fcm = (token: string) => ({ kind: 'fcm', token })

type Served = { notifications?: boolean; store?: DeviceStore; users?: UserTableOptions }

// An app with auth on a fresh store, an admin, Alice and Bob, and notifications in the devices table or `store`.
const serve = async ({ notifications = true, store, users }: Served = {}) => {
  const pg = await openSnapshotDb('empty')
  // Better Auth checks its schema once per instance: one writes the store, a new one serves it, as after a deploy.
  const authOn = async () => {
    const made = createAuth({ database: { dialect: pg.dialect, type: 'postgres' }, baseURL: origin, secret, mailer: false, operator: false, signInProvider: false, signInPerMinute: 100, ...(users && { users }) })
    await made.$context
    await settled()
    return made
  }
  await pg.exec((await authSchemaMigration(await authOn()))!)
  const auth = await authOn()
  const options = store ? { store } : {}
  if (notifications && !store) await pg.exec((await notificationsMigration(pg.db, options, auth))!)
  if (notifications) await checkNotificationsSchema(pg.db, options, auth)
  const app = createAdmin({ resources: [], db: pg.db, authenticate: betterAuthAuthenticator({ auth }), auth, ...(notifications && { notifications: options }) })
  await createUser(auth, { email: 'root@example.com', password, role: 'admin' })
  const alice = await createUser(auth, { email: 'alice@example.com', password, role: 'user' })
  const bob = await createUser(auth, { email: 'bob@example.com', password, role: 'user' })

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(`${origin}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify(body) })
  const cookieOf = async (email: string) => {
    const signIn = await post('/api/auth/sign-in/email', { email, password })
    expect(signIn.status).toBe(200)
    return signIn.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
  }
  const tokenOf = async (email: string) => ((await (await app.request(`${origin}/api/auth/token`, { headers: { cookie: await cookieOf(email), origin } })).json()) as { token: string }).token
  const register = (token: string, body: unknown) => post(devicesPath('/api'), body, { authorization: `Bearer ${token}` })
  const devicesOf = async (userId: string) => (await pg.query('select token from notifications.devices where user_id = $1 order by token', [userId])).rows
  return { pg, auth, app, alice, bob, post, cookieOf, tokenOf, register, devicesOf }
}

describe.each([
  { name: "auth's users table", users: undefined, table: '"user"' },
  { name: 'a renamed users table', users: { table: 'people', columns: { email: 'address' } }, table: '"people"' },
])('the devices table with $name', ({ users, table }) => {
  it("points at the users table, so deleting a user deletes their devices and no one else's", async () => {
    const { pg, alice, bob, tokenOf, register, devicesOf, auth } = await serve({ users })
    const migration = await notificationsMigration(pg.db, { schema: 'other' }, auth)
    expect(migration).toContain(`references ${table} (id) on delete cascade`)
    const aliceToken = await tokenOf('alice@example.com')
    expect((await register(aliceToken, fcm('alice-1'))).status).toBe(200)
    expect((await register(aliceToken, fcm('alice-2'))).status).toBe(200)
    expect((await register(await tokenOf('bob@example.com'), fcm('bob-1'))).status).toBe(200)

    await deleteUser(auth, 'alice@example.com')
    expect(await devicesOf(alice.id)).toEqual([])
    expect(await devicesOf(bob.id)).toEqual([{ token: 'bob-1' }])
    // Alice's token stops with her: a register on it stores nothing.
    expect((await register(aliceToken, fcm('alice-3'))).status).toBe(401)
    expect(await devicesOf(alice.id)).toEqual([])
  })
})

describe('the devices endpoints with auth', () => {
  it("stop startup while the devices table's user column does not go with the user", async () => {
    const { pg, auth } = await serve()
    await pg.exec('alter table notifications.devices drop constraint devices_user_id_fkey')
    await expect(checkNotificationsSchema(pg.db, {}, auth)).rejects.toThrow('needs a foreign key from "user_id" to "user" with on delete cascade')
  })

  it('are an unknown route without notifications()', async () => {
    const { register, tokenOf } = await serve({ notifications: false })
    expect((await register(await tokenOf('alice@example.com'), fcm('alice-1'))).status).toBe(404)
  })

  it("refuse a token that stands for no one's own sign-in session", async () => {
    const { register, auth, alice, devicesOf } = await serve()
    const issued = await issueToken(auth, { email: 'alice@example.com' })
    expect((await register(issued.token, fcm('issued'))).status).toBe(403)
    expect(await devicesOf(alice.id)).toEqual([])
  })
})

describe('deleting a user with a device store of the app own', () => {
  const recording = (fail = false) => {
    const memory = memoryDeviceStore()
    const removed: string[] = []
    const store: DeviceStore = {
      ...memory,
      removeAllForUser: async (userId) => {
        removed.push(userId)
        if (fail) throw new Error('the device store is down')
        await memory.removeAllForUser(userId)
      },
    }
    return { memory, store, removed }
  }

  it("removes exactly the user's devices, by an admin and by the CLI", async () => {
    const { memory, store, removed } = recording()
    const { alice, bob, tokenOf, register, post, cookieOf, auth } = await serve({ store })
    expect((await register(await tokenOf('alice@example.com'), fcm('alice-1'))).status).toBe(200)
    expect((await register(await tokenOf('bob@example.com'), fcm('bob-1'))).status).toBe(200)

    // Bob may not remove Alice: nothing of hers goes.
    expect((await post('/api/auth/admin/remove-user', { userId: alice.id }, { cookie: await cookieOf('bob@example.com') })).status).toBe(403)
    expect(removed).toEqual([])

    expect((await post('/api/auth/admin/remove-user', { userId: alice.id }, { cookie: await cookieOf('root@example.com') })).status).toBe(200)
    expect(removed).toEqual([alice.id, alice.id])
    expect([...memory.devices.values()].map((device) => device.userId)).toEqual([bob.id])

    await deleteUser(auth, 'bob@example.com')
    expect(removed).toEqual([alice.id, alice.id, bob.id, bob.id])
    expect(memory.devices.size).toBe(0)
  })

  it('keeps the user, their sessions and their accounts when the store fails', async () => {
    const { store } = recording(true)
    const { pg, alice, auth, cookieOf } = await serve({ store })
    await cookieOf('alice@example.com')
    await expect(deleteUser(auth, 'alice@example.com')).rejects.toThrow('the device store is down')
    const count = async (from: string) => (await pg.query<{ n: number }>(`select count(*)::int as n from ${from} where ${from === '"user"' ? 'id' : 'user_id'} = $1`, [alice.id])).rows[0]!.n
    expect(await count('"user"')).toBe(1)
    expect(await count('session')).toBe(1)
    expect(await count('account')).toBe(1)
  })

  it('removes a device registered while the user was being deleted', async () => {
    const memory = memoryDeviceStore()
    let raced = false
    const store: DeviceStore = {
      ...memory,
      removeAllForUser: async (userId) => {
        await memory.removeAllForUser(userId)
        // A register from the user's still-live session, landing right after the first removal.
        if (!raced) await memory.register(userId, { kind: 'fcm', token: 'late', p256dh: null, auth: null, environment: null, appId: null, userAgent: null })
        raced = true
      },
    }
    const { auth } = await serve({ store })
    await deleteUser(auth, 'alice@example.com')
    expect(memory.devices.size).toBe(0)
  })
})
