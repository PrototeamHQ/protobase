import { describe, expect, it } from 'vitest'
import type { NewDevice } from '../device'
import type { DeviceStore } from '../device-store'

// One device of each kind, every field that does not apply to it null.
export const webDevice = (n = 1): NewDevice => ({
  kind: 'web',
  token: `https://fcm.googleapis.com/fcm/send/device-${n}`,
  p256dh: `B${'A'.repeat(86)}`,
  auth: 'AAAAAAAAAAAAAAAAAAAAAA',
  environment: null,
  appId: null,
  userAgent: 'Mozilla/5.0',
  sessionId: 'session-1',
})
export const apnsDevice = (n = 1): NewDevice => ({ kind: 'apns', token: `${n}`.padStart(64, 'a'), p256dh: null, auth: null, environment: 'production', appId: 'net.example.app', userAgent: null, sessionId: null })
export const fcmDevice = (n = 1): NewDevice => ({ kind: 'fcm', token: `fcm-token:${n}`, p256dh: null, auth: null, environment: null, appId: null, userAgent: null, sessionId: null })

// The device a register stored, which these devices always are.
const registered = async (store: DeviceStore, userId: string, device: NewDevice) => {
  const stored = await store.register(userId, device)
  if (!stored) throw new Error('The store kept no device')
  return stored
}

const tokens = (devices: { token: string }[]) => devices.map((device) => device.token).sort()

/**
 * What every device store must do, for a store `open` makes empty for each test; `users` are ids the store's users
 * table holds, when it has one.
 */
export const deviceStoreContract = (name: string, open: () => Promise<DeviceStore>, [a, b]: readonly [string, string] = ['user-a', 'user-b']) =>
  describe(`${name}: the device store contract`, () => {
    it('keeps each kind as given, with null for what does not apply', async () => {
      const store = await open()
      for (const device of [webDevice(), apnsDevice(), fcmDevice()]) {
        const stored = await registered(store, a, device)
        expect(stored).toMatchObject({ ...device, userId: a })
        expect(stored.createdAt).toBeInstanceOf(Date)
        expect(stored.lastSeenAt).toBeInstanceOf(Date)
        expect(await store.listByIds([stored.id])).toEqual([stored])
      }
      expect(tokens(await store.listForUser(a))).toEqual(tokens([webDevice(), apnsDevice(), fcmDevice()]))
    })

    it('refreshes a device its user registers again, keeping its id and taking its new session', async () => {
      const store = await open()
      const first = await registered(store, a, fcmDevice())
      const again = await registered(store, a, { ...fcmDevice(), userAgent: 'App/2', sessionId: 'session-2' })
      expect(again).toMatchObject({ id: first.id, userAgent: 'App/2', userId: a, sessionId: 'session-2' })
      expect(await store.listForUser(a)).toHaveLength(1)
    })

    it("keeps a browser's endpoint another user holds as it is, answering undefined", async () => {
      const store = await open()
      const held = await registered(store, a, webDevice())
      expect(await store.register(b, { ...webDevice(), sessionId: 'session-b' })).toBeUndefined()
      expect(await store.listForUser(a)).toEqual([held])
      expect(await store.listForUser(b)).toEqual([])
    })

    it('moves a token another user holds as a new device with only what the new user gave', async () => {
      const store = await open()
      const held = await registered(store, a, { ...apnsDevice(), userAgent: 'A' })
      const moved = await registered(store, b, { ...apnsDevice(), environment: 'sandbox', appId: 'net.example.other' })
      expect(moved).toMatchObject({ ...apnsDevice(), environment: 'sandbox', appId: 'net.example.other', userAgent: null, userId: b })
      expect(moved.id).not.toBe(held.id)
      expect(await store.listForUser(a)).toEqual([])
      expect(await store.listByIds([held.id])).toEqual([])
      // A's remove by the id it was given leaves B's device.
      await store.remove(a, held.id)
      expect(await store.listForUser(b)).toEqual([moved])
    })

    it('keeps one record of a token registered again as another kind', async () => {
      const store = await open()
      await registered(store, a, fcmDevice())
      const other = await registered(store, b, { ...apnsDevice(), token: fcmDevice().token })
      expect(await store.listForUser(a)).toEqual([])
      expect(await store.listForUser(b)).toEqual([other])
    })

    it("removes a device for its own user only, and all of one user's alone", async () => {
      const store = await open()
      const own = await registered(store, a, webDevice())
      const theirs = await registered(store, b, webDevice(2))
      await store.remove(b, own.id)
      await store.removeAllForUser(b)
      expect(await store.listForUser(a)).toEqual([own])
      expect(await store.listByIds([theirs.id])).toEqual([])
      await store.remove(a, own.id)
      expect(await store.listForUser(a)).toEqual([])
    })

    it('removes the tokens reported gone, and nothing for an empty list', async () => {
      const store = await open()
      await registered(store, a, fcmDevice(1))
      const kept = await registered(store, b, fcmDevice(2))
      await store.removeGone([])
      expect(await store.listByIds([])).toEqual([])
      await store.removeGone([fcmDevice(1).token])
      expect(await store.listForUser(a)).toEqual([])
      expect(await store.listForUser(b)).toEqual([kept])
    })

    it('refuses an empty, undefined or null user id, id or token, touching nothing', async () => {
      const store = await open()
      const kept = await registered(store, a, fcmDevice())
      for (const empty of ['', undefined, null] as unknown as string[]) {
        await expect(store.register(empty, fcmDevice(2))).rejects.toThrow()
        await expect(store.register(b, { ...fcmDevice(2), token: empty })).rejects.toThrow()
        await expect(store.remove(empty, kept.id)).rejects.toThrow()
        await expect(store.remove(a, empty)).rejects.toThrow()
        await expect(store.listForUser(empty)).rejects.toThrow()
        await expect(store.listByIds([empty])).rejects.toThrow()
        await expect(store.removeGone([empty])).rejects.toThrow()
        await expect(store.removeAllForUser(empty)).rejects.toThrow()
      }
      expect(await store.listForUser(a)).toEqual([kept])
      expect(await store.listForUser(b)).toEqual([])
    })
  })
