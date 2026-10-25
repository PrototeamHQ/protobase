import { pushRecord } from '@protobase/schema/internal'

/**
 * Which user this browser's push subscription is registered for, kept where the service worker reads it before it
 * shows a push: the user, the subscription's endpoint, the app's name for a push without a title, the device's id once
 * the server has it, and `renew` once the worker saw the subscription change.
 */
export type PushRecord = { userId: string; endpoint: string; appName: string; deviceId?: string; renew?: boolean }

/** The one push record of this browser. */
export type PushRecords = {
  read: () => Promise<PushRecord | undefined>
  write: (record: PushRecord) => Promise<void>
  clear: () => Promise<void>
}

/** The push record in IndexedDB, at the database, store and key the service worker reads (`pushRecord`). */
export const indexedDbPushRecords = (factory: IDBFactory = indexedDB): PushRecords => {
  const request = <T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>) =>
    new Promise<T>((resolve, reject) => {
      const opened = factory.open(pushRecord.database, 1)
      opened.onupgradeneeded = () => opened.result.createObjectStore(pushRecord.store)
      opened.onerror = () => reject(opened.error)
      opened.onsuccess = () => {
        const db = opened.result
        const asked = act(db.transaction(pushRecord.store, mode).objectStore(pushRecord.store))
        asked.onsuccess = () => (db.close(), resolve(asked.result))
        asked.onerror = () => (db.close(), reject(asked.error))
      }
    })
  return {
    read: () => request<PushRecord | undefined>('readonly', (store) => store.get(pushRecord.key)),
    write: async (record) => void (await request('readwrite', (store) => store.put(record, pushRecord.key))),
    clear: async () => void (await request('readwrite', (store) => store.delete(pushRecord.key))),
  }
}
