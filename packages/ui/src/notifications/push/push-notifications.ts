import type { NativeBridge } from '../../app/native-auth-fetch'
import { nativePush, pushPluginName } from './native-push'
import { deviceUserAgent, windowPushBrowser } from './push-browser'
import { indexedDbPushRecords } from './push-records'
import { webPush, type WebPush, type WebPushOptions } from './web-push'

/** Push in this page: whether it is on, turning it on from a click and off, and keeping it with who is signed in. */
export type PushNotifications = WebPush

// Push where the page has none: everything answers `unsupported` and changes nothing.
const noPush: PushNotifications = {
  state: async () => 'unsupported',
  turnOn: async () => 'unsupported',
  turnOff: async () => {},
  forget: async () => {},
  adopt: async () => {},
}

/**
 * The push of this page, the one place its transport is chosen: Web Push in a browser; FCM in the Android app
 * (`nativeBridge`) when its build compiled the push plugin in, which it does only with the project's Firebase file;
 * none in the iOS app yet, nor where the page has no window.
 */
export const pushNotifications = ({ nativeBridge, ...options }: Omit<WebPushOptions, 'browser' | 'records'> & { nativeBridge?: NativeBridge }): PushNotifications => {
  if (typeof window === 'undefined') return noPush
  if (nativeBridge) {
    if (nativeBridge.getPlatform() !== 'android' || !nativeBridge.isPluginAvailable(pushPluginName)) return noPush
    const { devices, user, waitMs } = options
    return nativePush({ bridge: nativeBridge, records: indexedDbPushRecords(), devices, user, userAgent: deviceUserAgent(navigator.userAgent), ...(waitMs !== undefined && { waitMs }) })
  }
  const browser = windowPushBrowser()
  if (!browser.supported) return noPush
  return webPush({ ...options, browser, records: indexedDbPushRecords() })
}
