import { describe, expect, it, vi } from 'vitest'
import { deleteUser } from '../src/better-auth/users'
import type { DeviceStore } from '../src/notifications/device-store'
import { memoryDeviceStore } from '../src/notifications/testing/memory-store'
import { fcm, serve } from './support/notifications-app'

// Real scrypt hashing runs on this thread, CPU work a busy machine stretches past 5 s.
vi.setConfig({ testTimeout: 30_000 })

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
        if (!raced) await memory.register(userId, { kind: 'fcm', token: 'late', p256dh: null, auth: null, environment: null, appId: null, userAgent: null, sessionId: null })
        raced = true
      },
    }
    const { auth } = await serve({ store })
    await deleteUser(auth, 'alice@example.com')
    expect(memory.devices.size).toBe(0)
  })
})
