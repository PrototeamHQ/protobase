import { describe, expect, it } from 'vitest'
import { ApiError, type WebDeviceRegistration } from '@protobase/client'
import type { PushBrowser, PushRegistration } from './push-browser'
import type { PushRecord } from './push-records'
import { webPush, type PushUser } from './web-push'

const key = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
const alice: PushUser = { id: 'alice', own: true }
const bob: PushUser = { id: 'bob', own: true }

const conflict = (slug: string) => new ApiError({ type: `urn:protobase:problem:${slug}`, title: 'Conflict', status: 409 })
const never = () => new Promise<never>(() => {})

type Options = {
  permission?: NotificationPermission
  answer?: NotificationPermission
  activated?: boolean
  supported?: boolean
  webPushKey?: string
  record?: PushRecord
  endpoint?: string
  registered?: boolean
  register?: (device: WebDeviceRegistration, attempt: number) => Promise<{ id: string }>
  remove?: () => Promise<void>
  unsubscribe?: () => Promise<boolean>
}

// A browser, its record and the server, writing every step that leaves the page, in order, to `log`.
const setup = (options: Options = {}) => {
  const log: string[] = []
  let signedIn: PushUser | undefined = alice
  let permission = options.permission ?? 'default'
  let record = options.record
  let next = 0
  let subscription: PushSubscription | undefined
  const shown = [{ closed: false }]
  const subscribeAs = (endpoint: string) => {
    subscription = {
      endpoint,
      toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh', auth: 'auth' } }),
      unsubscribe: async () => {
        log.push('unsubscribe')
        subscription = undefined
        return options.unsubscribe ? options.unsubscribe() : true
      },
    } as unknown as PushSubscription
  }
  if (options.endpoint) subscribeAs(options.endpoint)
  const registration: PushRegistration = {
    pushManager: {
      getSubscription: async () => subscription ?? null,
      subscribe: async (given: PushSubscriptionOptionsInit) => {
        log.push(`subscribe ${given.userVisibleOnly} ${(given.applicationServerKey as Uint8Array).length}`)
        subscribeAs(`https://fcm.googleapis.com/fcm/send/${++next}`)
        return subscription!
      },
    } as unknown as PushManager,
    getNotifications: async () => shown.filter((notification) => !notification.closed).map((notification) => ({ close: () => (notification.closed = true) })) as unknown as Notification[],
  }
  let registered = options.registered ?? true
  const browser: PushBrowser = {
    supported: options.supported ?? true,
    permission: () => permission,
    requestPermission: async () => {
      log.push('ask')
      permission = options.answer ?? 'granted'
      return permission
    },
    activated: () => options.activated ?? true,
    existingRegistration: async () => (registered ? registration : undefined),
    registration: async () => {
      registered = true
      return registration
    },
    clearBadge: async () => void log.push('clear badge'),
    userAgent: 'Test/1',
  }
  const sent: WebDeviceRegistration[] = []
  let attempts = 0
  const push = webPush({
    browser,
    records: {
      read: async () => record,
      write: async (given) => void ((record = given), log.push(`record ${given.userId}${given.deviceId ? ` ${given.deviceId}` : ''}`)),
      clear: async () => void ((record = undefined), log.push('forget')),
    },
    devices: {
      register: async (device) => {
        sent.push(device)
        log.push(`register ${device.userId}`)
        const { id } = options.register ? await options.register(device, ++attempts) : { id: 'device-1' }
        return { id, kind: 'web' as const, createdAt: '', lastSeenAt: '' }
      },
      remove: async (id) => {
        log.push(`remove ${id}`)
        if (options.remove) await options.remove()
      },
    },
    meta: async () => ({ appName: 'Tasks', ...(options.webPushKey !== '' && { webPushKey: options.webPushKey ?? key }) }),
    user: () => signedIn,
    waitMs: 20,
  })
  return {
    push,
    log,
    sent,
    shown,
    record: () => record,
    subscription: () => subscription,
    signIn: (user: PushUser | undefined) => (signedIn = user),
  }
}

const aliceRecord = (endpoint = 'https://fcm.googleapis.com/fcm/send/old'): PushRecord => ({ userId: 'alice', endpoint, appName: 'Tasks', deviceId: 'device-0' })

describe('webPush state', () => {
  it('is unsupported without Web Push, or without a key in /meta', async () => {
    expect(await setup({ supported: false }).push.state()).toBe('unsupported')
    expect(await setup({ webPushKey: '' }).push.state()).toBe('unsupported')
  })

  it('is blocked when the user refused, and on only for a subscription the record gives the signed-in user', async () => {
    expect(await setup({ permission: 'denied' }).push.state()).toBe('blocked')
    expect(await setup().push.state()).toBe('off')
    const endpoint = 'https://fcm.googleapis.com/fcm/send/old'
    expect(await setup({ permission: 'granted', endpoint, record: aliceRecord(endpoint) }).push.state()).toBe('on')
    const other = setup({ permission: 'granted', endpoint, record: aliceRecord(endpoint) })
    other.signIn(bob)
    expect(await other.push.state()).toBe('off')
  })
})

describe('webPush turnOn', () => {
  it('asks once, subscribes with the key, keeps the record and registers the device for the user who clicked', async () => {
    const browser = setup()
    expect(await browser.push.turnOn()).toBe('on')
    expect(browser.log).toEqual(['ask', 'subscribe true 65', 'record alice', 'register alice', 'record alice device-1'])
    expect(browser.sent).toEqual([{ kind: 'web', endpoint: 'https://fcm.googleapis.com/fcm/send/1', keys: { p256dh: 'p256dh', auth: 'auth' }, userAgent: 'Test/1', userId: 'alice' }])
    expect(await browser.push.state()).toBe('on')
  })

  it('does nothing without a click, for staff signed in as the user, or for a visitor, even with permission granted', async () => {
    for (const [user, activated] of [[alice, false], [{ id: 'alice', own: false }, true], [undefined, true]] as const) {
      const browser = setup({ permission: 'granted', activated })
      browser.signIn(user)
      await browser.push.turnOn()
      expect(browser.log).toEqual([])
    }
  })

  it('never asks again once the user refused, and stays off when they refuse now', async () => {
    const blocked = setup({ permission: 'denied' })
    expect(await blocked.push.turnOn()).toBe('blocked')
    expect(blocked.log).toEqual([])
    const refusing = setup({ answer: 'denied' })
    expect(await refusing.push.turnOn()).toBe('blocked')
    expect(refusing.log).toEqual(['ask'])
  })

  it("drops a subscription this browser holds for someone else, or without a record, before subscribing", async () => {
    for (const record of [{ ...aliceRecord('https://fcm.googleapis.com/fcm/send/old'), userId: 'bob' }, undefined]) {
      const browser = setup({ permission: 'granted', endpoint: 'https://fcm.googleapis.com/fcm/send/old', ...(record && { record }) })
      expect(await browser.push.turnOn()).toBe('on')
      expect(browser.log.slice(0, 4)).toEqual(['forget', 'clear badge', 'unsubscribe', 'subscribe true 65'])
      expect(browser.shown[0]!.closed).toBe(true)
    }
  })

  it('subscribes afresh once when another user holds the endpoint, and gives up the second time', async () => {
    const once = setup({ register: async (_, attempt) => (attempt === 1 ? Promise.reject(conflict('device-held')) : { id: 'device-2' }) })
    expect(await once.push.turnOn()).toBe('on')
    expect(once.sent.map((device) => device.endpoint)).toEqual(['https://fcm.googleapis.com/fcm/send/1', 'https://fcm.googleapis.com/fcm/send/2'])
    const twice = setup({ register: () => Promise.reject(conflict('device-held')) })
    expect(await twice.push.turnOn()).toBe('off')
    expect(twice.sent).toHaveLength(2)
    expect(twice.record()).toBeUndefined()
    expect(twice.subscription()).toBeUndefined()
  })

  it('gives up without a retry when the server says someone else is signed in, or the page says so', async () => {
    const refused = setup({ register: () => Promise.reject(conflict('other-user')) })
    expect(await refused.push.turnOn()).toBe('off')
    expect(refused.sent).toHaveLength(1)
    expect(refused.record()).toBeUndefined()
    expect(refused.subscription()).toBeUndefined()

    const switched = setup({ register: async () => ({ id: 'never' }) })
    // Bob signs in in another tab while Alice's click is being handled.
    const turning = switched.push.turnOn()
    switched.signIn(bob)
    expect(await turning).not.toBe('on')
    expect(switched.sent).toEqual([])
    expect(switched.record()).toBeUndefined()
  })

  it('leaves nothing behind when the server fails, and rethrows', async () => {
    const browser = setup({ register: () => Promise.reject(new ApiError({ type: 'urn:protobase:problem:internal-error', title: 'Internal Server Error', status: 500 })) })
    await expect(browser.push.turnOn()).rejects.toBeInstanceOf(ApiError)
    expect(browser.record()).toBeUndefined()
    expect(browser.subscription()).toBeUndefined()
  })
})

describe('webPush turnOff, as at sign-out', () => {
  const endpoint = 'https://fcm.googleapis.com/fcm/send/old'

  it('forgets the record first, closes what was shown and clears the badge, then unsubscribes and removes the device', async () => {
    const browser = setup({ permission: 'granted', endpoint, record: aliceRecord(endpoint) })
    await browser.push.turnOff()
    expect(browser.log.slice(0, 2)).toEqual(['forget', 'clear badge'])
    // Both leave the page at once, after the page forgot the registration.
    expect(browser.log.slice(2).sort()).toEqual(['remove device-0', 'unsubscribe'])
    expect(browser.shown[0]!.closed).toBe(true)
  })

  it.each([
    ['a server error', () => Promise.reject(new ApiError({ type: 'urn:protobase:problem:internal-error', title: 'x', status: 500 }))],
    ['a 404', () => Promise.reject(new ApiError({ type: 'urn:protobase:problem:not-found', title: 'x', status: 404 }))],
    ['no network', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('still unsubscribes and forgets when the removal fails with %s', async (_, remove) => {
    const browser = setup({ permission: 'granted', endpoint, record: aliceRecord(endpoint), remove })
    await browser.push.turnOff()
    expect(browser.subscription()).toBeUndefined()
    expect(browser.record()).toBeUndefined()
  })

  it('forgets the record before anything else when unsubscribing fails', async () => {
    const browser = setup({ permission: 'granted', endpoint, record: aliceRecord(endpoint), unsubscribe: () => Promise.reject(new Error('offline')) })
    await browser.push.turnOff()
    expect(browser.log[0]).toBe('forget')
    expect(browser.record()).toBeUndefined()
  })

  it('goes on in bounded time when the push service and the server never answer', async () => {
    const browser = setup({ permission: 'granted', endpoint, record: aliceRecord(endpoint), unsubscribe: never, remove: never })
    await browser.push.turnOff()
    expect(browser.record()).toBeUndefined()
  })
})

describe('webPush adopt, at every load and sign-in', () => {
  const endpoint = 'https://fcm.googleapis.com/fcm/send/old'

  it("forgets another user's registration here, closing what it showed, and registers nothing", async () => {
    const browser = setup({ permission: 'granted', endpoint, record: aliceRecord(endpoint) })
    await browser.push.adopt(bob)
    expect(browser.log).toEqual(['forget', 'clear badge', 'unsubscribe'])
    expect(browser.shown[0]!.closed).toBe(true)
    expect(browser.sent).toEqual([])
  })

  it('unsubscribes a subscription without a record, and registers nothing', async () => {
    const browser = setup({ permission: 'granted', endpoint })
    await browser.push.adopt(bob)
    expect(browser.subscription()).toBeUndefined()
    expect(browser.sent).toEqual([])
  })

  it("registers the user's own subscription again, with no click, only when they signed in as themselves", async () => {
    const own = setup({ permission: 'granted', endpoint, record: aliceRecord(endpoint) })
    await own.push.adopt(alice)
    expect(own.sent.map((device) => [device.endpoint, device.userId])).toEqual([[endpoint, 'alice']])
    const staff = setup({ permission: 'granted', endpoint, record: aliceRecord(endpoint) })
    await staff.push.adopt({ id: 'alice', own: false })
    expect(staff.sent).toEqual([])
    expect(staff.record()).toEqual(aliceRecord(endpoint))
  })

  it('registers a renewed subscription, and drops one that changed without the worker seeing it', async () => {
    const renewed = setup({ permission: 'granted', endpoint: 'https://fcm.googleapis.com/fcm/send/new', record: { ...aliceRecord(endpoint), renew: true } })
    await renewed.push.adopt(alice)
    expect(renewed.sent.map((device) => device.endpoint)).toEqual(['https://fcm.googleapis.com/fcm/send/new'])
    expect(renewed.record()).toEqual({ userId: 'alice', endpoint: 'https://fcm.googleapis.com/fcm/send/new', appName: 'Tasks', deviceId: 'device-1' })
    const changed = setup({ permission: 'granted', endpoint: 'https://fcm.googleapis.com/fcm/send/new', record: aliceRecord(endpoint) })
    await changed.push.adopt(alice)
    expect(changed.sent).toEqual([])
    expect(changed.subscription()).toBeUndefined()
  })

  it('drops the registration once the permission is withdrawn, and forgets it when the server refuses it', async () => {
    const withdrawn = setup({ permission: 'default', endpoint, record: aliceRecord(endpoint) })
    await withdrawn.push.adopt(alice)
    expect(withdrawn.sent).toEqual([])
    expect(withdrawn.record()).toBeUndefined()
    const held = setup({ permission: 'granted', endpoint, record: aliceRecord(endpoint), register: () => Promise.reject(conflict('device-held')) })
    await held.push.adopt(alice)
    expect(held.record()).toBeUndefined()
    expect(held.subscription()).toBeUndefined()
  })
})
