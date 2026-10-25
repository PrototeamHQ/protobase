import { ApiError, type DevicesClient } from '@protobase/client'
import type { PushBrowser, PushRegistration } from './push-browser'
import type { PushRecord, PushRecords } from './push-records'

/** Whether this browser gets the signed-in user's push: it cannot, it does not, it does, or the user blocked it. */
export type PushState = 'unsupported' | 'off' | 'on' | 'blocked'

/** The signed-in user, and whether they signed in as themselves rather than staff signed in as them. */
export type PushUser = { id: string; own: boolean }

export type WebPushOptions = {
  browser: PushBrowser
  records: PushRecords
  devices: Pick<DevicesClient, 'register' | 'remove'>
  /** The app's name and the VAPID public key browsers subscribe with, from `/meta`; no key means no Web Push. */
  meta: () => Promise<{ appName: string; webPushKey?: string }>
  /** Who is signed in now, read again after every step that waits. */
  user: () => PushUser | undefined
  /** How long sign-out waits for the push service and the server before it goes on regardless. */
  waitMs?: number
}

// The key as the bytes `subscribe` takes everywhere.
const keyBytes = (key: string) => Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0))

// The promise, or nothing once `ms` have passed.
const within = (ms: number, promise: Promise<unknown>) => Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))])

/** Someone else signed in while push was being turned on. */
class SignedInChanged extends Error {}

const isRefusal = (error: unknown, slug: 'device-held' | 'other-user') => error instanceof ApiError && error.status === 409 && error.slug === slug

/**
 * Web Push for the signed-in user in this browser. It registers only from a click by someone signed in as themselves,
 * never on its own, except to renew the registration this browser already has for that same user. Signing out, or
 * someone else signing in, forgets the registration here first, closing what it showed, then unsubscribes and removes
 * the device, without waiting long on either.
 */
export const webPush = ({ browser, records, devices, meta, user, waitMs = 3000 }: WebPushOptions) => {
  // The one `/meta` answer the helper needs, read once.
  let metaRead: Promise<{ appName: string; webPushKey?: string }> | undefined
  const appMeta = () => (metaRead ??= meta())

  // Nothing of the registration stays in this browser: the record first, then what the worker showed and the badge.
  const forgetHere = async (registration?: PushRegistration) => {
    await records.clear()
    for (const shown of registration ? await registration.getNotifications() : []) shown.close()
    await browser.clearBadge()
  }

  const unsubscribe = async (registration: PushRegistration | undefined) => {
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription) await subscription.unsubscribe()
  }

  // Forgets the registration here, then unsubscribes, without registering anything.
  const drop = async (registration: PushRegistration) => {
    await forgetHere(registration)
    await unsubscribe(registration)
  }

  const register = async (subscription: PushSubscription, record: PushRecord) => {
    const keys = subscription.toJSON().keys ?? {}
    const device = await devices.register({ kind: 'web', endpoint: subscription.endpoint, keys: { p256dh: keys.p256dh ?? '', auth: keys.auth ?? '' }, userAgent: browser.userAgent, userId: record.userId })
    await records.write({ ...record, deviceId: device.id })
  }

  const state = async (): Promise<PushState> => {
    if (!browser.supported || !(await appMeta()).webPushKey) return 'unsupported'
    if (browser.permission() === 'denied') return 'blocked'
    const signedIn = user()
    const registration = await browser.existingRegistration()
    const [subscription, record] = await Promise.all([registration?.pushManager.getSubscription(), records.read()])
    return signedIn && subscription && record?.userId === signedIn.id && record.endpoint === subscription.endpoint ? 'on' : 'off'
  }

  /**
   * Turns push on for the signed-in user, from their click: call it in the click handler itself. Asks for permission
   * when the user has not answered yet, subscribes and registers the device. Does nothing without a click, for staff
   * signed in as the user or for a visitor; a refusal or someone else signing in meanwhile leaves push off.
   */
  const turnOn = async (): Promise<PushState> => {
    const signedIn = user()
    if (!browser.supported || !browser.activated() || !signedIn?.own) return state()
    if (browser.permission() === 'default' && (await browser.requestPermission()) !== 'granted') return state()
    if (browser.permission() !== 'granted') return state()
    const { appName, webPushKey } = await appMeta()
    if (!webPushKey) return 'unsupported'
    const same = () => user()?.id === signedIn.id && user()?.own === true
    const registration = await browser.registration()
    if (!same()) return state()
    // A subscription this browser holds for anyone else, or without a record, goes before a fresh one.
    const [held, earlier] = await Promise.all([registration.pushManager.getSubscription(), records.read()])
    if (held && (earlier?.userId !== signedIn.id || earlier.endpoint !== held.endpoint)) await drop(registration)

    const subscribeAndRegister = async () => {
      if (!same()) throw new SignedInChanged()
      const subscription = (await registration.pushManager.getSubscription()) ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(webPushKey) }))
      const record = { userId: signedIn.id, endpoint: subscription.endpoint, appName }
      await records.write(record)
      if (!same()) throw new SignedInChanged()
      await register(subscription, record)
    }
    try {
      await subscribeAndRegister()
    } catch (error) {
      // Another user holds the endpoint: one fresh subscription, then give up.
      if (isRefusal(error, 'device-held')) {
        await drop(registration)
        return retryOnce(registration, subscribeAndRegister)
      }
      await drop(registration)
      if (error instanceof SignedInChanged || isRefusal(error, 'other-user')) return 'off'
      throw error
    }
    return 'on'
  }

  const retryOnce = async (registration: PushRegistration, attempt: () => Promise<void>): Promise<PushState> => {
    try {
      await attempt()
    } catch (error) {
      await drop(registration)
      if (error instanceof SignedInChanged || isRefusal(error, 'device-held') || isRefusal(error, 'other-user')) return 'off'
      throw error
    }
    return 'on'
  }

  /**
   * Turns push off in this browser: forgets it here, unsubscribes and removes the device, waiting at most `waitMs` on
   * the push service and the server. A removal that fails is left to the server, which drops the endpoint once the push
   * service reports it gone.
   */
  const turnOff = async () => {
    if (!browser.supported) return
    const registration = await browser.existingRegistration()
    const record = await records.read()
    await forgetHere(registration)
    await within(waitMs, Promise.allSettled([unsubscribe(registration), record?.deviceId ? devices.remove(record.deviceId) : Promise.resolve()]))
  }

  /** As `turnOff`, for a session already over, whose device the server can no longer be asked to remove. */
  const forget = async () => {
    if (!browser.supported) return
    const registration = await browser.existingRegistration()
    await forgetHere(registration)
    await within(waitMs, Promise.allSettled([unsubscribe(registration)]))
  }

  /**
   * Takes the signed-in user in, on every load and sign-in: a registration here for anyone else, or without a record,
   * is forgotten and unsubscribed; the user's own, when they signed in as themselves and the permission stands, is
   * registered again, so the device follows their session and a renewed subscription. Nothing is ever registered anew.
   */
  const adopt = async (signedIn: PushUser) => {
    if (!browser.supported) return
    const registration = await browser.existingRegistration()
    const [subscription, record] = await Promise.all([registration?.pushManager.getSubscription(), records.read()])
    if (!registration) return record ? records.clear() : undefined
    if (!record || record.userId !== signedIn.id) return subscription || record ? drop(registration) : undefined
    if (!signedIn.own) return
    if (!subscription || browser.permission() !== 'granted') return drop(registration)
    if (record.endpoint !== subscription.endpoint && !record.renew) return drop(registration)
    const renewed = { userId: record.userId, endpoint: subscription.endpoint, appName: record.appName }
    await records.write(renewed)
    try {
      await register(subscription, renewed)
    } catch (error) {
      if (!isRefusal(error, 'device-held') && !isRefusal(error, 'other-user')) throw error
      await drop(registration)
    }
  }

  return { state, turnOn, turnOff, forget, adopt }
}

export type WebPush = ReturnType<typeof webPush>
