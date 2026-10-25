import { serviceWorkerFile } from '@protobase/schema/internal'

/** What the push helper uses of a service worker registration. */
export type PushRegistration = Pick<ServiceWorkerRegistration, 'pushManager' | 'getNotifications'>

/**
 * What the push helper needs of the browser, so the helper is the same in a test: whether Web Push is there at all,
 * the notification permission, whether the user just clicked, the worker's registration and the app's badge.
 */
export type PushBrowser = {
  /** A service worker, the Push API, notifications and user activation; an iPhone's Safari tab has no Push API. */
  supported: boolean
  permission: () => NotificationPermission
  requestPermission: () => Promise<NotificationPermission>
  /** Whether the user is acting on the page now, as a click makes them. */
  activated: () => boolean
  /** The worker's registration, when one is registered. */
  existingRegistration: () => Promise<PushRegistration | undefined>
  /** The worker's registration, registering `/protobase.sw.js` first when there is none, as in `protobase dev`. */
  registration: () => Promise<PushRegistration>
  clearBadge: () => Promise<void>
  userAgent: string
}

/** The page's own browser. */
export const windowPushBrowser = (win: Window & typeof globalThis = window): PushBrowser => {
  const { navigator } = win
  const supported = 'serviceWorker' in navigator && 'PushManager' in win && 'Notification' in win && 'userActivation' in navigator
  return {
    supported,
    permission: () => win.Notification.permission,
    requestPermission: () => win.Notification.requestPermission(),
    activated: () => navigator.userActivation.isActive,
    existingRegistration: () => navigator.serviceWorker.getRegistration('/'),
    registration: async () => {
      if (!(await navigator.serviceWorker.getRegistration('/'))) await navigator.serviceWorker.register(`/${serviceWorkerFile}`)
      return navigator.serviceWorker.ready
    },
    clearBadge: async () => {
      if ('clearAppBadge' in navigator) await navigator.clearAppBadge()
    },
    // As the server takes it: no control characters, at most 512 characters.
    userAgent: navigator.userAgent.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 512),
  }
}
