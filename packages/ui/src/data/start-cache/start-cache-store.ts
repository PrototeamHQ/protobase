/** Where the start cache keeps its records: a few values by key, structured-cloned as IndexedDB stores them. */
export type StartCacheStore = {
  read: (key: string) => Promise<unknown>
  write: (key: string, value: unknown) => Promise<void>
  remove: (keys: readonly string[]) => Promise<void>
}

const databaseName = 'protobase-start-cache'
const storeName = 'records'

/**
 * The start cache in this origin's IndexedDB: in the iOS and Android app the web view's storage inside the app's
 * sandbox, which a fresh install's purge removes. One connection serves the page. Each call is a transaction of its own,
 * and IndexedDB runs them in the order they were made, so a removal after a write always wins.
 */
export const indexedDbStartCacheStore = (factory: IDBFactory = indexedDB): StartCacheStore => {
  let opened: Promise<IDBDatabase> | undefined
  const open = () =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(databaseName, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(storeName)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    }))
  const run = async <T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T> | undefined) => {
    const db = await open()
    return new Promise<T | undefined>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode)
      const request = act(transaction.objectStore(storeName))
      // A failed request aborts its transaction, which then holds the error; the error event comes before it has it
      transaction.oncomplete = () => resolve(request?.result)
      transaction.onabort = () => reject(transaction.error ?? new DOMException('The start cache transaction was aborted', 'AbortError'))
    })
  }
  return {
    read: (key) => run('readonly', (store) => store.get(key)),
    write: async (key, value) => void (await run('readwrite', (store) => store.put(value, key))),
    remove: async (keys) =>
      void (await run('readwrite', (store) => {
        for (const key of keys) store.delete(key)
        return undefined
      })),
  }
}
