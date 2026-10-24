import { checkedNotification, type StoredNotification } from '../history'
import { maxUnreadCount, requiredPage, requiredText, requiredTime, type HistoryStore } from '../history-store'

// Newest first: by creation time, then by id, as the Postgres store orders them.
const newestFirst = (a: StoredNotification, b: StoredNotification) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)

const copy = (entry: StoredNotification): StoredNotification => structuredClone(entry)

/**
 * A history store in memory, for tests only: it shows the interface needs no database. `entries` is its content, for a
 * test to read.
 */
export const memoryHistoryStore = () => {
  const entries = new Map<string, StoredNotification>()
  const own = (userId: string) => [...entries.values()].filter((entry) => entry.userId === userId)
  const store: HistoryStore = {
    record: async (userId, notification) => {
      requiredText('user id', userId)
      const stored: StoredNotification = { ...checkedNotification(notification), id: crypto.randomUUID(), userId, createdAt: new Date(), readAt: null }
      entries.set(stored.id, stored)
      return copy(stored)
    },
    list: async (userId, page) => {
      requiredText('user id', userId)
      const { before, limit } = requiredPage(page)
      const after = (entry: StoredNotification) => !before || newestFirst(entry, { createdAt: before.createdAt, id: before.id } as StoredNotification) > 0
      return own(userId).sort(newestFirst).filter(after).slice(0, limit).map(copy)
    },
    countUnread: async (userId) => {
      requiredText('user id', userId)
      return Math.min(own(userId).filter((entry) => entry.readAt === null).length, maxUnreadCount)
    },
    markRead: async (userId, id) => {
      requiredText('user id', userId)
      requiredText('id', id)
      const entry = entries.get(id)
      if (entry?.userId !== userId) return false
      entry.readAt ??= new Date()
      return true
    },
    markAllRead: async (userId, upTo) => {
      requiredText('user id', userId)
      requiredTime('time', upTo)
      const now = new Date()
      for (const entry of own(userId)) if (entry.readAt === null && entry.createdAt <= upTo) entry.readAt = now
    },
    removeAllForUser: async (userId) => {
      requiredText('user id', userId)
      for (const entry of own(userId)) entries.delete(entry.id)
    },
  }
  return Object.assign(store, { entries })
}
