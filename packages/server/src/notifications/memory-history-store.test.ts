import { expectTypeOf } from 'vitest'
import type { NewNotification, StoredNotification } from './history'
import type { HistoryStore } from './history-store'
import type { JsonObject } from './json-value'
import { historyStoreContract } from './testing/history-store-contract'
import { memoryHistoryStore } from './testing/memory-history-store'

historyStoreContract('in memory', async () => memoryHistoryStore())

// The interface is plain data: strings, numbers, dates and the notification records, nothing of a database.
expectTypeOf<Parameters<HistoryStore['record']>>().toEqualTypeOf<[userId: string, notification: NewNotification]>()
expectTypeOf<ReturnType<HistoryStore['countUnread']>>().toEqualTypeOf<Promise<number>>()
expectTypeOf<{ [K in keyof StoredNotification]: StoredNotification[K] }>().toEqualTypeOf<{
  title: string
  body: string | null
  url: string | null
  data: JsonObject | null
  id: string
  userId: string
  createdAt: Date
  readAt: Date | null
}>()
