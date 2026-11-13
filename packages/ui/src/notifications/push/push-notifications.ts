import type { NativeBridge } from '../../app/native-auth-fetch'
import { nativeDevice } from './native-device'
import { nativePush } from './native-push'
import { deviceUserAgent, windowPushBrowser } from './push-browser'
import { storagePushKeptOff } from './push-kept-off'
import { indexedDbPushRecords } from './push-records'
import { webPush, type WebPush, type WebPushOptions } from './web-push'

/**
 * Push in this page: whether it is on, turning it on from a click and off, and keeping it with who is signed in.
 * `turnOff({ chosen: true })` is the user turning it off, which the app then never undoes by itself.
 */
export type PushNotifications = Omit<WebPush, 'turnOff'> & { turnOff: (options?: { chosen?: boolean }) => Promise<void> }

// Push where the page has none: everything answers `unsupported` and changes nothing.
const noPush: PushNotifications = {
  state: async () => 'unsupported',
  turnOn: async () => 'unsupported',
  turnOff: async () => {},
  forget: async () => {},
  adopt: async () => {},
}

/**
 * The push of this page, the one place its transport is chosen: Web Push in a browser; FCM in the Android app and APNs
 * in the iOS app (`nativeBridge`) when its build compiled native push in (`nativeDevice`); none where the page has no
 * window.
 */
export const pushNotifications = ({ nativeBridge, ...options }: Omit<WebPushOptions, 'browser' | 'records'> & { nativeBridge?: NativeBridge }): PushNotifications => {
  if (typeof window === 'undefined') return noPush
  if (nativeBridge) {
    const device = nativeDevice(nativeBridge)
    if (!device) return noPush
    const { devices, user, waitMs } = options
    return nativePush({ bridge: nativeBridge, device, records: indexedDbPushRecords(), keptOff: storagePushKeptOff(() => localStorage), devices, user, userAgent: deviceUserAgent(navigator.userAgent), ...(waitMs !== undefined && { waitMs }) })
  }
  const browser = windowPushBrowser()
  if (!browser.supported) return noPush
  return webPush({ ...options, browser, records: indexedDbPushRecords() })
}
