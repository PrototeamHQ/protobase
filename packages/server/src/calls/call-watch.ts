import { recordId, type CallItem } from './call-reads'
import type { CallRecord } from './call-store'
import type { CallStore } from './calls-store'

type Watcher = { record: CallRecord; listener: (items: CallItem[]) => void; sent?: string }

/**
 * The records whose calls open pages follow on this process: each read reads all of them in one query, and tells a
 * page only when its record's calls changed.
 */
export const callWatch = (store: CallStore) => {
  const watchers = new Set<Watcher>()

  const read = async (some: readonly Watcher[]) => {
    const records = [...new Map(some.map((watcher) => [recordId(watcher.record), watcher.record])).values()]
    const found = await store.recordCalls(records)
    for (const watcher of some) {
      if (!watchers.has(watcher)) continue
      const items = found.get(recordId(watcher.record)) ?? []
      const body = JSON.stringify(items)
      if (watcher.sent === body) continue
      watcher.sent = body
      watcher.listener(items)
    }
  }

  return {
    get size() {
      return watchers.size
    },
    /** Tells `listener` the record's calls now, then whenever they change, until the returned function is called. */
    add: async (record: CallRecord, listener: (items: CallItem[]) => void) => {
      const watcher: Watcher = { record, listener }
      watchers.add(watcher)
      await read([watcher])
      return () => void watchers.delete(watcher)
    },
    read: () => read([...watchers]),
  }
}
