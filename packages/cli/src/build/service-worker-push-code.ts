import { pushRecord } from '@protobase/schema/internal'

/**
 * The service worker's push handlers, in the shell's worker and as all of `protobase dev`'s. Nothing in it is a secret:
 * the worker learns the user this browser is registered for from the record the push helper keeps (`pushRecord`).
 *
 * - `push` shows the notification's title, body and tag, and sets the app's badge to its number, only while the record
 *   names the subscription's endpoint and the push names the record's user. A push without a title shows the app's
 *   name alone. A push with no record, or for another endpoint or user, shows nothing: the worker closes what it showed,
 *   clears the badge, drops the record and unsubscribes.
 * - `notificationclick` opens the notification's url only when it is an absolute `http` or `https` URL, parsed without
 *   a base: on the worker's own origin in a window of the app, focused and navigated there, or in a new window when none
 *   is open; on any other origin always in a new window. Anything else opens nothing, whoever showed the notification.
 * - `pushsubscriptionchange` marks an existing record for renewal, which the helper registers once its user is signed
 *   in; the worker has no token to do so itself.
 */
export const pushHandlersCode = `const pushRecord = ${JSON.stringify(pushRecord)}

const pushRecordRequest = (mode, act) => new Promise((resolve, reject) => {
  const opened = self.indexedDB.open(pushRecord.database, 1)
  opened.onupgradeneeded = () => opened.result.createObjectStore(pushRecord.store)
  opened.onerror = () => reject(opened.error)
  opened.onsuccess = () => {
    const db = opened.result
    const request = act(db.transaction(pushRecord.store, mode).objectStore(pushRecord.store))
    request.onsuccess = () => (db.close(), resolve(request.result))
    request.onerror = () => (db.close(), reject(request.error))
  }
})
const readPushRecord = () => pushRecordRequest('readonly', (store) => store.get(pushRecord.key))
const writePushRecord = (record) => pushRecordRequest('readwrite', (store) => store.put(record, pushRecord.key))
const dropPushRecord = () => pushRecordRequest('readwrite', (store) => store.delete(pushRecord.key))

// No whitespace or control character, which a URL parser drops silently, so java\\tscript: cannot pass as javascript:.
const plainUrl = /^[^\\s\\u0000-\\u001f\\u007f-\\u009f]+$/

const tapUrl = (value) => {
  if (typeof value !== 'string' || value.length > 2048 || !plainUrl.test(value)) return undefined
  let url
  try {
    url = new URL(value)
  } catch (error) {
    if (error instanceof TypeError) return undefined
    throw error
  }
  return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
}

const pushData = (data) => {
  if (!data) return undefined
  let value
  try {
    value = data.json()
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

const text = (value) => (typeof value === 'string' ? value : undefined)

// This browser is no longer registered for anyone: nothing it showed stays, and it gets no more pushes.
const forgetPush = async () => {
  for (const shown of await self.registration.getNotifications()) shown.close()
  if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge()
  await dropPushRecord()
  const subscription = await self.registration.pushManager.getSubscription()
  if (subscription) await subscription.unsubscribe()
}

const showPush = async (data) => {
  const [record, subscription] = await Promise.all([readPushRecord(), self.registration.pushManager.getSubscription()])
  if (!record || !subscription || record.endpoint !== subscription.endpoint) return forgetPush()
  const push = pushData(data)
  if (!push || text(push.title) === undefined) return self.registration.showNotification(text(record.appName) || self.location.host, {})
  if (push.user !== record.userId) return forgetPush()
  const url = tapUrl(push.url)
  const options = {}
  if (text(push.body) !== undefined) options.body = push.body
  if (text(push.tag) !== undefined) options.tag = push.tag
  if (url !== undefined) options.data = { url }
  if (typeof push.badge === 'number' && self.navigator.setAppBadge) await self.navigator.setAppBadge(push.badge)
  return self.registration.showNotification(push.title, options)
}

// A window of the app navigated to the url as a page load; a window the worker cannot navigate gets a new one instead.
const openInApp = async (url) => {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const open = windows.find((client) => new URL(client.url).origin === self.location.origin)
  if (!open) return self.clients.openWindow(url)
  try {
    const focused = await open.focus()
    return await focused.navigate(url)
  } catch (error) {
    if (error instanceof TypeError) return self.clients.openWindow(url)
    throw error
  }
}

const openTap = (notification) => {
  notification.close()
  const url = tapUrl(notification.data && notification.data.url)
  if (url === undefined) return Promise.resolve()
  return new URL(url).origin === self.location.origin ? openInApp(url) : self.clients.openWindow(url)
}

self.addEventListener('push', (event) => event.waitUntil(showPush(event.data)))
self.addEventListener('notificationclick', (event) => event.waitUntil(openTap(event.notification)))
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(readPushRecord().then((record) => record && writePushRecord({ ...record, renew: true })))
})
`

/**
 * The worker `protobase dev` serves when the app has `notifications()`: the push handlers alone, taking over the open
 * pages at once so a tap can navigate them. It caches nothing.
 */
export const devServiceWorkerCode = `self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

${pushHandlersCode}`
