import { ApiError, type DevicesClient } from '@protobase/client'
import type { NativeBridge } from '../../app/native-auth-fetch'
import type { PushRecords } from './push-records'
import type { PushState, PushUser } from './web-push'

/** Capacitor's push plugin, by the name its native side registers; the app has it only when the build compiled it in. */
export const pushPluginName = 'PushNotifications'

export type NativePushOptions = {
  bridge: NativeBridge
  records: PushRecords
  devices: Pick<DevicesClient, 'register' | 'remove'>
  /** Who is signed in now, read again after every step that waits. */
  user: () => PushUser | undefined
  userAgent: string
  /** How long sign-out waits for FCM and the server before it goes on regardless. */
  waitMs?: number
  /** How long turning push on waits for the app's FCM token. */
  tokenMs?: number
}

type Permission = { receive: 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied' }

// The promise, or nothing once `ms` have passed.
const within = (ms: number, promise: Promise<unknown>) => Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))])

/** Someone else signed in while push was being turned on. */
class SignedInChanged extends Error {}

const isRefusal = (error: unknown, slug: 'device-held' | 'other-user') => error instanceof ApiError && error.status === 409 && error.slug === slug

/**
 * Push in the Android app through Capacitor's push plugin, called through the native bridge: the app's FCM token is
 * registered as an `fcm` device, only for someone signed in as themselves who turned it on, and kept for that same user
 * alone. Signing out, or someone else signing in, forgets it here and deletes the token, so the next user gets a new
 * one. The token is never written anywhere but to the server and the local record.
 */
export const nativePush = ({ bridge, records, devices, user, userAgent, waitMs = 3000, tokenMs = 15_000 }: NativePushOptions) => {
  const call = (method: string, options: object = {}) => bridge.nativePromise(pushPluginName, method, options)
  const permission = async () => ((await call('checkPermissions')) as Permission).receive

  // The app's current FCM token, from the event `register` answers with.
  const token = () =>
    new Promise<string>((resolve, reject) => {
      let listeners: Array<{ remove(): Promise<void> }> = []
      const finish = (settle: () => void) => {
        clearTimeout(timer)
        for (const listener of listeners) void listener.remove()
        listeners = []
        settle()
      }
      const timer = setTimeout(() => finish(() => reject(new Error(`FCM gave the app no push token within ${tokenMs} ms`))), tokenMs)
      listeners = [
        bridge.addListener(pushPluginName, 'registration', (data) => finish(() => resolve((data as { value: string }).value))),
        bridge.addListener(pushPluginName, 'registrationError', () => finish(() => reject(new Error('FCM gave the app no push token')))),
      ]
      call('register').catch((error: unknown) => finish(() => reject(error)))
    })

  // Nothing of the registration stays here: the record, what the phone shows, and the token, which FCM deletes.
  const drop = async () => {
    await records.clear()
    await call('removeAllDeliveredNotifications')
    await call('unregister')
  }

  const register = async (signedIn: PushUser) => {
    const same = () => user()?.id === signedIn.id && user()?.own === true
    const current = await token()
    if (!same()) throw new SignedInChanged()
    const device = await devices.register({ kind: 'fcm', token: current, userAgent, userId: signedIn.id })
    if (!same()) throw new SignedInChanged()
    return { device, token: current }
  }

  const state = async (): Promise<PushState> => {
    const allowed = await permission()
    if (allowed === 'denied') return 'blocked'
    const [signedIn, record] = [user(), await records.read()]
    return signedIn && allowed === 'granted' && record?.userId === signedIn.id ? 'on' : 'off'
  }

  /**
   * Turns push on for the signed-in user: asks for the permission from Android 13 on when the user has not answered,
   * registers with FCM and the token as the user's device. Does nothing for staff signed in as the user or a visitor;
   * a refusal or someone else signing in meanwhile leaves push off. A token another user holds is deleted and one fresh
   * token tried, as a browser subscribes afresh.
   */
  const turnOn = async (): Promise<PushState> => {
    const signedIn = user()
    if (!signedIn?.own) return state()
    let allowed = await permission()
    if (allowed === 'prompt' || allowed === 'prompt-with-rationale') allowed = ((await call('requestPermissions')) as Permission).receive
    if (allowed !== 'granted') return state()
    const attempt = async () => {
      const { device, token: current } = await register(signedIn)
      await records.write({ userId: signedIn.id, endpoint: current, deviceId: device.id })
    }
    try {
      await attempt()
    } catch (error) {
      await drop()
      if (error instanceof SignedInChanged || isRefusal(error, 'other-user')) return 'off'
      if (!isRefusal(error, 'device-held')) throw error
      try {
        await attempt()
      } catch (retried) {
        await drop()
        if (retried instanceof SignedInChanged || isRefusal(retried, 'device-held') || isRefusal(retried, 'other-user')) return 'off'
        throw retried
      }
    }
    return 'on'
  }

  /** Turns push off here: forgets it, deletes the token and removes the device, waiting at most `waitMs` on FCM and the server. */
  const turnOff = async () => {
    const record = await records.read()
    await records.clear()
    await within(waitMs, Promise.allSettled([call('removeAllDeliveredNotifications'), call('unregister'), record?.deviceId ? devices.remove(record.deviceId) : Promise.resolve()]))
  }

  /** As `turnOff`, for a session already over, whose device the server can no longer be asked to remove. */
  const forget = async () => {
    await records.clear()
    await within(waitMs, Promise.allSettled([call('removeAllDeliveredNotifications'), call('unregister')]))
  }

  /**
   * Takes the signed-in user in, on every load and sign-in: a registration here for anyone else is forgotten and its
   * token deleted; the user's own, when they signed in as themselves and the permission stands, is registered again
   * with the app's current token, which FCM may have renewed, and the device of an older token removed.
   */
  const adopt = async (signedIn: PushUser) => {
    const record = await records.read()
    if (!record) return
    if (record.userId !== signedIn.id) return drop()
    if (!signedIn.own) return
    if ((await permission()) !== 'granted') return drop()
    try {
      const { device, token: current } = await register(signedIn)
      await records.write({ userId: signedIn.id, endpoint: current, deviceId: device.id })
      if (record.deviceId && record.deviceId !== device.id) await devices.remove(record.deviceId)
    } catch (error) {
      if (error instanceof SignedInChanged) return
      if (!isRefusal(error, 'device-held') && !isRefusal(error, 'other-user')) throw error
      await drop()
    }
  }

  return { state, turnOn, turnOff, forget, adopt }
}
