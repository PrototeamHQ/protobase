import { expect } from 'vitest'
import { authSchemaMigration } from '../../src/better-auth/auth-schema'
import { betterAuthAuthenticator } from '../../src/better-auth/authenticator'
import { createAuth } from '../../src/better-auth/create-auth'
import { liveSessions } from '../../src/better-auth/live-sessions'
import { createUser } from '../../src/better-auth/users'
import type { UserTableOptions } from '../../src/better-auth/user-table'
import { createAdmin } from '../../src/create-admin'
import type { Mailer } from '../../src/mail/smtp-mailer'
import { deliver } from '../../src/notifications/deliver'
import type { DeviceStore } from '../../src/notifications/device-store'
import type { HistoryStore } from '../../src/notifications/history-store'
import { devicesPath } from '../../src/notifications/paths'
import { postgresDeviceStore } from '../../src/notifications/postgres-store'
import { noProgress } from '../../src/notifications/push-payload'
import { checkNotificationsSchema, notificationsMigration } from '../../src/notifications/schema'
import type { PushSender } from '../../src/notifications/sender'
import { checkedSend } from '../../src/notifications/send-input'
import { openSnapshotDb, settled } from '../../../../test-support/sql-snapshot'

export const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'
export const password = 'correct horse battery'
export const fcm = (token: string) => ({ kind: 'fcm', token })
export const browser = (name: string) => ({ kind: 'web', endpoint: `https://fcm.googleapis.com/fcm/send/${name}`, keys: { p256dh: Buffer.alloc(65, 4).toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url') } })

type Served = { notifications?: boolean; store?: DeviceStore; historyStore?: HistoryStore; users?: UserTableOptions; mailer?: Mailer }

// An app with auth on a fresh store, an admin, Alice and Bob, and notifications in the devices table or `store`; with
// `mailer`, auth sends its mail through it.
export const serve = async ({ notifications = true, store, historyStore, users, mailer }: Served = {}) => {
  const pg = await openSnapshotDb('empty')
  // Better Auth checks its schema once per instance: one writes the store, a new one serves it, as after a deploy.
  const authOn = async () => {
    const made = createAuth({ database: { dialect: pg.dialect, type: 'postgres' }, baseURL: origin, secret, mailer: mailer ?? false, operator: false, signInProvider: false, signInPerMinute: 100, ...(users && { users }) })
    await made.$context
    await settled()
    return made
  }
  await pg.exec((await authSchemaMigration(await authOn()))!)
  const auth = await authOn()
  const options = { ...(store && { store }), ...(historyStore && { historyStore }) }
  if (notifications && !(store && historyStore)) await pg.exec((await notificationsMigration(pg.db, options, auth))!)
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

// A send to `userId` as the push job delivers it with Protobase's auth: the endpoints' names it reached.
export const pushTo = async ({ pg, auth }: Awaited<ReturnType<typeof serve>>, userId: string) => {
  const reached: string[] = []
  const sender: PushSender = {
    kinds: ['web', 'fcm'],
    send: async (_message, devices) => {
      reached.push(...devices.map((device) => device.token.slice(device.token.lastIndexOf('/') + 1)))
      return devices.map((device) => ({ id: device.id, result: 'ok' as const }))
    },
  }
  const done = async () => {}
  await deliver(checkedSend({ userIds: [userId], inbox: false }, { title: 'Private' }), noProgress(), {
    devices: postgresDeviceStore(pg.db),
    senders: [sender],
    record: done,
    save: done,
    hold: done,
    complete: done,
    liveSessions: liveSessions(auth),
  })
  return reached.sort()
}
