import { describe, expect, it } from 'vitest'
import { ApiError, type DevicesClient, type FcmDeviceRegistration } from '@protobase/client'
import type { NativeBridge } from '../../app/native-auth-fetch'
import { nativePush } from './native-push'
import type { PushRecord } from './push-records'
import type { PushUser } from './web-push'

const alice: PushUser = { id: 'alice', own: true }
const bob: PushUser = { id: 'bob', own: true }
const conflict = (slug: string) => new ApiError({ type: `urn:protobase:problem:${slug}`, title: 'Conflict', status: 409 })

type Options = {
  permission?: 'prompt' | 'granted' | 'denied'
  answer?: 'granted' | 'denied'
  record?: PushRecord
  /** FCM answers `register` with an error instead of a token. */
  tokenError?: boolean
  register?: (device: FcmDeviceRegistration, attempt: number) => Promise<{ id: string }>
}

// The push plugin, which hands out a new token after `unregister`, its record and the server, writing every call that leaves the page, in order, to `log`.
const setup = (options: Options = {}) => {
  const log: string[] = []
  const sent: FcmDeviceRegistration[] = []
  let permission = options.permission ?? 'granted'
  let record = options.record
  let generation = 1
  let attempts = 0
  let signedIn: PushUser | undefined = alice
  const listeners = new Map<string, Set<(data: unknown) => void>>()
  const emit = (event: string, data: unknown) => {
    for (const listener of listeners.get(event) ?? []) listener(data)
  }
  const bridge: NativeBridge = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    isPluginAvailable: () => true,
    nativePromise: async (plugin, method) => {
      expect(plugin).toBe('PushNotifications')
      if (method !== 'checkPermissions') log.push(method)
      if (method === 'checkPermissions') return { receive: permission }
      if (method === 'requestPermissions') {
        permission = options.answer ?? 'granted'
        return { receive: permission }
      }
      if (method === 'register') queueMicrotask(() => (options.tokenError ? emit('registrationError', { error: 'SERVICE_NOT_AVAILABLE' }) : emit('registration', { value: `token-${generation}` })))
      if (method === 'unregister') generation += 1
      return undefined
    },
    addListener: (_plugin, event, callback) => {
      const set = listeners.get(event) ?? new Set()
      set.add(callback)
      listeners.set(event, set)
      return { remove: async () => void set.delete(callback) }
    },
  }
  const push = nativePush({
    bridge,
    userAgent: 'Android',
    user: () => signedIn,
    records: {
      read: async () => record,
      write: async (next) => void ((record = next), log.push(`record ${next.userId} ${next.endpoint}`)),
      clear: async () => void ((record = undefined), log.push('forget')),
    },
    devices: {
      register: async (registration: Parameters<DevicesClient['register']>[0]) => {
        if (registration.kind !== 'fcm') throw new Error('The app registers an fcm device')
        sent.push(registration)
        log.push(`device ${registration.userId} ${registration.token}`)
        const { id } = options.register ? await options.register(registration, ++attempts) : { id: `device-${registration.token}` }
        return { id, kind: 'fcm' as const, createdAt: '', lastSeenAt: '' }
      },
      remove: async (id) => void log.push(`remove ${id}`),
    },
    device: async (token) => ({ kind: 'fcm', token }),
    tokenMs: 50,
  })
  return { push, log, sent, listeners, record: () => record, signIn: (user: PushUser | undefined) => (signedIn = user) }
}

describe('nativePush', () => {
  it('registers the app\'s FCM token as an fcm device of the signed-in user, and reports on', async () => {
    const { push, log, sent, listeners } = setup()
    expect(await push.state()).toBe('off')
    expect(await push.turnOn()).toBe('on')
    expect(sent).toEqual([{ kind: 'fcm', token: 'token-1', userAgent: 'Android', userId: 'alice' }])
    expect(log).toEqual(['register', 'device alice token-1', 'record alice token-1'])
    expect(await push.state()).toBe('on')
    expect([...listeners.values()].every((set) => set.size === 0)).toBe(true)
  })

  it('asks for the permission from Android 13 on, and registers nothing when the user refuses', async () => {
    const asked = setup({ permission: 'prompt' })
    expect(await asked.push.turnOn()).toBe('on')
    expect(asked.log[0]).toBe('requestPermissions')
    const refused = setup({ permission: 'prompt', answer: 'denied' })
    expect(await refused.push.turnOn()).toBe('blocked')
    expect(refused.log).toEqual(['requestPermissions'])
    expect(refused.sent).toEqual([])
  })

  it('reports blocked once the permission is refused, and never registers', async () => {
    const { push, log } = setup({ permission: 'denied' })
    expect(await push.state()).toBe('blocked')
    expect(await push.turnOn()).toBe('blocked')
    expect(log).toEqual([])
  })

  it('does nothing for a visitor or staff signed in as the user', async () => {
    for (const user of [undefined, { id: 'alice', own: false }]) {
      const { push, log, signIn } = setup()
      signIn(user)
      expect(await push.turnOn()).toBe('off')
      expect(log).toEqual([])
    }
  })

  it('leaves push off and deletes the token when someone else signed in while it waited', async () => {
    const { push, log, sent, signIn } = setup()
    const turning = push.turnOn()
    signIn(bob)
    expect(await turning).toBe('off')
    expect(sent).toEqual([])
    expect(log).toEqual(['register', 'forget', 'removeAllDeliveredNotifications', 'unregister'])
  })

  it('tries one fresh token when another user holds this one, then gives up', async () => {
    const once = setup({ register: async (_device, attempt) => (attempt === 1 ? Promise.reject(conflict('device-held')) : { id: 'device-2' }) })
    expect(await once.push.turnOn()).toBe('on')
    expect(once.sent.map(({ token }) => token)).toEqual(['token-1', 'token-2'])
    const always = setup({ register: async () => Promise.reject(conflict('device-held')) })
    expect(await always.push.turnOn()).toBe('off')
    expect(always.sent).toHaveLength(2)
    expect(always.record()).toBeUndefined()
  })

  it('fails when the push service gives no token, leaving nothing registered', async () => {
    const { push, sent, record } = setup({ tokenError: true })
    await expect(push.turnOn()).rejects.toThrow('The push service gave the app no push token')
    expect(sent).toEqual([])
    expect(record()).toBeUndefined()
  })

  it('on sign-out forgets push here, deletes the token and removes the device', async () => {
    const { push, log } = setup({ record: { userId: 'alice', endpoint: 'token-1', deviceId: 'device-1' } })
    await push.turnOff()
    expect(log).toEqual(['forget', 'removeAllDeliveredNotifications', 'unregister', 'remove device-1'])
  })

  it('gives the next user a token of their own, none left tied to the one before', async () => {
    const { push, sent, log, signIn } = setup()
    expect(await push.turnOn()).toBe('on')
    await push.turnOff()
    signIn(bob)
    await push.adopt(bob)
    expect(await push.state()).toBe('off')
    expect(await push.turnOn()).toBe('on')
    expect(sent.map(({ userId, token }) => `${userId} ${token}`)).toEqual(['alice token-1', 'bob token-2'])
    expect(log).toContain('remove device-token-1')
  })

  it('drops a registration of another user it finds on sign-in', async () => {
    const { push, log, signIn } = setup({ record: { userId: 'alice', endpoint: 'token-1', deviceId: 'device-1' } })
    signIn(bob)
    await push.adopt(bob)
    expect(log).toEqual(['forget', 'removeAllDeliveredNotifications', 'unregister'])
  })

  it('registers the user\'s current token again on sign-in, removing the device of a renewed one', async () => {
    const { push, log } = setup({ record: { userId: 'alice', endpoint: 'token-0', deviceId: 'device-0' } })
    await push.adopt(alice)
    expect(log).toEqual(['register', 'device alice token-1', 'record alice token-1', 'remove device-0'])
  })

  it('drops the registration on sign-in when the permission was taken back', async () => {
    const { push, log, sent } = setup({ permission: 'denied', record: { userId: 'alice', endpoint: 'token-1', deviceId: 'device-1' } })
    await push.adopt(alice)
    expect(sent).toEqual([])
    expect(log).toEqual(['forget', 'removeAllDeliveredNotifications', 'unregister'])
  })
})
