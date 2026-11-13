import { describe, expect, it } from 'vitest'
import { ApiError, type DevicesClient, type FcmDeviceRegistration } from '@protobase/client'
import type { NativeBridge } from '../../app/native-auth-fetch'
import { nativePush } from './native-push'
import { storagePushChoices, type PushChoice } from './push-choices'
import { PushChoiceNotStored, PushRegistrationError, PushTokenTimeout } from './push-failure'
import type { PushRecord } from './push-records'
import type { PushUser } from './web-push'

const alice: PushUser = { id: 'alice', own: true }
const bob: PushUser = { id: 'bob', own: true }
const entitlement = 'no valid aps-environment entitlement string found for application'
const conflict = (slug: string) => new ApiError({ type: `urn:protobase:problem:${slug}`, title: 'Conflict', status: 409 })

type Options = {
  permission?: 'prompt' | 'granted' | 'denied'
  answer?: 'granted' | 'denied'
  record?: PushRecord
  /** The push service answers `register` with this error instead of a token. */
  tokenError?: string
  /** The push service never answers `register`. */
  silent?: boolean
  platform?: 'ios' | 'android'
  /** The push service fails `unregister` with this error. */
  unregisterError?: string
  register?: (device: FcmDeviceRegistration, attempt: number) => Promise<{ id: string }>
  /** What users chose for push here themselves. */
  choices?: Record<string, PushChoice>
  /** The device cannot write what users chose. */
  unwritable?: boolean
  /** The device cannot read what users chose. */
  unreadable?: boolean
  /** The phone asked for the permission, as iOS and Android from 13 on do; true unless given. */
  permissionAsked?: boolean
}

// The push plugin, which hands out a new token after `unregister`, its record and the server, writing every call that leaves the page, in order, to `log`.
const setup = (options: Options = {}) => {
  const log: string[] = []
  const sent: FcmDeviceRegistration[] = []
  const reported: Error[] = []
  let permission = options.permission ?? 'granted'
  let record = options.record
  let generation = 1
  let attempts = 0
  let signedIn: PushUser | undefined = alice
  const stored = new Map<string, string>()
  const choices = storagePushChoices(() => ({
    getItem: (key) => {
      if (options.unreadable) throw new Error('The storage is blocked')
      return stored.get(key) ?? null
    },
    setItem: (key, value) => {
      if (options.unwritable) throw new Error('The quota is used up')
      stored.set(key, value)
    },
  }))
  for (const [id, choice] of Object.entries(options.choices ?? {})) choices.set(id, choice)
  const listeners = new Map<string, Set<(data: unknown) => void>>()
  const emit = (event: string, data: unknown) => {
    for (const listener of listeners.get(event) ?? []) listener(data)
  }
  const bridge: NativeBridge = {
    isNativePlatform: () => true,
    getPlatform: () => options.platform ?? 'android',
    isPluginAvailable: () => true,
    nativePromise: async (plugin, method) => {
      expect(plugin).toBe('PushNotifications')
      if (method !== 'checkPermissions') log.push(method)
      if (method === 'checkPermissions') return { receive: permission }
      if (method === 'requestPermissions') {
        permission = options.answer ?? 'granted'
        return { receive: permission }
      }
      if (method === 'register' && !options.silent) queueMicrotask(() => (options.tokenError ? emit('registrationError', { error: options.tokenError }) : emit('registration', { value: `token-${generation}` })))
      if (method === 'unregister' && options.unregisterError) throw new Error(options.unregisterError)
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
    choices,
    permissionAsked: options.permissionAsked ?? true,
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
    report: (error) => void reported.push(error),
  })
  return { push, log, sent, reported, listeners, choices, record: () => record, signIn: (user: PushUser | undefined) => (signedIn = user) }
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
    await expect(always.push.turnOn()).rejects.toEqual(conflict('device-held'))
    expect(always.sent).toHaveLength(2)
    expect(always.record()).toBeUndefined()
  })

  it('fails with the server\'s refusal of the device, leaving nothing registered', async () => {
    const { push, record } = setup({ register: async () => Promise.reject(conflict('other-user')) })
    await expect(push.turnOn()).rejects.toEqual(conflict('other-user'))
    expect(record()).toBeUndefined()
  })

  it('fails with the reason the push service refused the app, reporting it once and leaving nothing registered', async () => {
    const { push, sent, log, record, reported } = setup({ tokenError: entitlement })
    await expect(push.turnOn()).rejects.toEqual(new PushRegistrationError(entitlement))
    expect(sent).toEqual([])
    expect(record()).toBeUndefined()
    expect(log).toEqual(['register', 'forget', 'removeAllDeliveredNotifications', 'unregister'])
    expect(reported).toHaveLength(1)
    expect(reported[0]).toBeInstanceOf(PushRegistrationError)
    expect(reported[0]?.message).toBe(`The push service gave the app no push token: ${entitlement}`)
  })

  it('drops the registration on sign-in when the push service refuses the app, reporting its reason once', async () => {
    const { push, sent, record, reported } = setup({ tokenError: entitlement, record: { userId: 'alice', endpoint: 'token-1', deviceId: 'device-1' } })
    await push.adopt(alice)
    expect(sent).toEqual([])
    expect(record()).toBeUndefined()
    expect(reported.map(({ message }) => message)).toEqual([`The push service gave the app no push token: ${entitlement}`])
  })

  it('reports the push service refusing the app on turning push on even when deleting the token fails, and still fails on that', async () => {
    const { push, reported } = setup({ tokenError: entitlement, unregisterError: 'gone' })
    await expect(push.turnOn()).rejects.toThrow('gone')
    expect(reported.map(({ message }) => message)).toEqual([`The push service gave the app no push token: ${entitlement}`])
  })

  it('reports the push service refusing the app on sign-in even when deleting the token fails, and still fails on that', async () => {
    const { push, reported } = setup({ tokenError: entitlement, unregisterError: 'gone', record: { userId: 'alice', endpoint: 'token-1', deviceId: 'device-1' } })
    await expect(push.adopt(alice)).rejects.toThrow('gone')
    expect(reported.map(({ message }) => message)).toEqual([`The push service gave the app no push token: ${entitlement}`])
  })

  it('still fails on any other error, such as the server refusing the device', async () => {
    const register = async () => Promise.reject(new Error('down'))
    const turning = setup({ register })
    await expect(turning.push.turnOn()).rejects.toThrow('down')
    const adopting = setup({ register, record: { userId: 'alice', endpoint: 'token-1', deviceId: 'device-1' } })
    await expect(adopting.push.adopt(alice)).rejects.toThrow('down')
    expect([...turning.reported, ...adopting.reported]).toEqual([])
  })

  it('fails naming the push service when it gives no token in time', async () => {
    const { push, sent } = setup({ silent: true, platform: 'ios' })
    const failure = await push.turnOn().catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PushTokenTimeout)
    expect(failure).toMatchObject({ service: 'apns', message: 'The push service gave the app no push token within 50 ms' })
    expect(sent).toEqual([])
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
    expect(await push.state()).toBe('on')
    expect(sent.map(({ userId, token }) => `${userId} ${token}`)).toEqual(['alice token-1', 'bob token-2'])
    expect(log).toContain('remove device-token-1')
  })

  it('registers by itself on launch when notifications were allowed before, without asking', async () => {
    const { push, log } = setup()
    await push.adopt(alice)
    expect(log).toEqual(['register', 'device alice token-1', 'record alice token-1'])
    expect(await push.state()).toBe('on')
  })

  it('registers nothing by itself while the permission is not given, never asking for it', async () => {
    for (const permission of ['prompt', 'denied'] as const) {
      const { push, log } = setup({ permission })
      await push.adopt(alice)
      expect(log).toEqual([])
    }
  })

  it('registers nothing by itself for staff signed in as the user', async () => {
    const { push, log } = setup()
    await push.adopt({ id: 'alice', own: false })
    expect(log).toEqual([])
  })

  it('keeps push off for a user who turned it off here, until they turn it on again', async () => {
    const { push, log, choices } = setup()
    expect(await push.turnOn()).toBe('on')
    await push.turnOff({ chosen: true })
    log.length = 0
    await push.adopt(alice)
    expect(log).toEqual([])
    expect(await push.turnOn()).toBe('on')
    expect(choices.of('alice')).toBe('on')
  })

  it('still turns push off when the device cannot store the choice, keeping it off this session and saying so', async () => {
    const { push, log } = setup({ unwritable: true })
    expect(await push.turnOn()).toBe('on')
    await expect(push.turnOff({ chosen: true })).rejects.toBeInstanceOf(PushChoiceNotStored)
    expect(log).toContain('remove device-token-1')
    expect(await push.state()).toBe('off')
    log.length = 0
    await push.adopt(alice)
    expect(log).toEqual([])
  })

  it('removes a registration left behind after the user turned push off, its device on the server too', async () => {
    const { push, log } = setup({ choices: { alice: 'off' }, record: { userId: 'alice', endpoint: 'token-1', deviceId: 'device-1' } })
    await push.adopt(alice)
    expect(log).toEqual(['forget', 'removeAllDeliveredNotifications', 'unregister', 'remove device-1'])
    expect(await push.state()).toBe('off')
  })

  it('keeps a registration, and registers no one by itself, while what users chose cannot be read', async () => {
    const kept = setup({ unreadable: true, record: { userId: 'alice', endpoint: 'token-0', deviceId: 'device-0' } })
    await kept.push.adopt(alice)
    expect(kept.log).toEqual(['register', 'device alice token-1', 'record alice token-1', 'remove device-0'])
    const none = setup({ unreadable: true })
    await none.push.adopt(alice)
    expect(none.log).toEqual([])
  })

  it('registers by itself before Android 13, which grants the permission unasked, only for a user who turned push on here before', async () => {
    const unasked = setup({ permissionAsked: false })
    await unasked.push.adopt(alice)
    expect(unasked.log).toEqual([])
    const chose = setup({ permissionAsked: false, choices: { alice: 'on' } })
    await chose.push.adopt(alice)
    expect(chose.log).toEqual(['register', 'device alice token-1', 'record alice token-1'])
  })

  it('registers again by itself after signing out, which is not turning push off', async () => {
    const { push, sent } = setup()
    expect(await push.turnOn()).toBe('on')
    await push.turnOff()
    await push.adopt(alice)
    expect(sent.map(({ token }) => token)).toEqual(['token-1', 'token-2'])
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
