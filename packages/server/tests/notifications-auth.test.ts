import { describe, expect, it, vi } from 'vitest'
import { issueToken } from '../src/better-auth/tokens'
import { deleteUser } from '../src/better-auth/users'
import { storeNames } from '../src/better-auth/store/store-names'
import { notificationDevicesModule } from '../src/notifications/devices-module'
import { notificationsTargets } from '../src/notifications/notifications-targets'
import { notificationsSchemaSql } from '../src/schema-modules/feature-schemas-sql'
import { fcm, serve } from './support/notifications-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

describe.each([
  { name: "auth's users table", tables: undefined, table: '"user"' },
  { name: 'a renamed users table', tables: { user: { name: 'people', columns: { email: 'address' } } }, table: '"people"' },
])('the devices table with $name', ({ tables, table }) => {
  it("points at the users table, so deleting a user deletes their devices and no one else's", async () => {
    const { pg, alice, bob, tokenOf, register, devicesOf, auth } = await serve({ ...(tables && { tables }) })
    expect(notificationsSchemaSql({ schema: 'other' }, auth)).toContain(`"user_id" text not null references ${table} (id) on delete cascade`)
    expect(await notificationDevicesModule.read(pg.db, notificationsTargets({}, storeNames(auth)).notification_devices!)).toMatchObject({ lastStep: 1 })
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
  it("are refused by the baseline while the devices table's user column does not go with the user", async () => {
    const { pg, auth } = await serve()
    await pg.exec('alter table notifications.devices drop constraint devices_user_id_fkey')
    await expect(notificationDevicesModule.read(pg.db, notificationsTargets({}, storeNames(auth)).notification_devices!)).rejects.toThrow('needs a foreign key from "user_id" to "user" with on delete cascade')
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
