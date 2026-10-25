/**
 * Where a browser keeps which user its push subscription is registered for, the record the push helper writes and the
 * service worker reads before it shows a push: an IndexedDB database, its store and the one key. The record is
 * `{ userId, endpoint, appName, deviceId?, renew? }`.
 */
export const pushRecord = { database: 'protobase-push', store: 'registration', key: 'current' } as const

/** The service worker's file, at the root of the app's origin so it may answer all of it. */
export const serviceWorkerFile = 'protobase.sw.js'
