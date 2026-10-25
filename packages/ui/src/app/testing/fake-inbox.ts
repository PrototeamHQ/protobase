import type { InboxNotification, NotificationHistoryClient } from '@protobase/client'

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

/** An inbox notification that came `minutes` ago, unread unless `read`. */
export const inboxNote = (id: string, minutes: number, fields: Partial<InboxNotification> & { read?: boolean } = {}): InboxNotification => {
  const { read, ...rest } = fields
  return { id, title: `Notification ${id}`, body: null, url: null, data: null, createdAt: minutesAgo(minutes), readAt: read ? minutesAgo(minutes) : null, ...rest }
}

/**
 * A history in memory, as the server keeps it for one user, for stories and tests: pages of `pageSize`, newest first,
 * the unread count up to 100, and marking read as the endpoints do.
 */
export const fakeInbox = (given: InboxNotification[], { pageSize = 20 }: { pageSize?: number } = {}): NotificationHistoryClient & { items: () => InboxNotification[] } => {
  let items = [...given].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const now = () => new Date().toISOString()
  return {
    items: () => items,
    list: async ({ cursor } = {}) => {
      const start = cursor === undefined ? 0 : Number(cursor)
      const page = items.slice(start, start + pageSize)
      return { items: page, next: page.length === pageSize && start + pageSize < items.length ? String(start + pageSize) : null }
    },
    unread: async () => Math.min(100, items.filter((item) => item.readAt === null).length),
    markRead: async (id) => {
      items = items.map((item) => (item.id === id && item.readAt === null ? { ...item, readAt: now() } : item))
    },
    markAllRead: async (upTo) => {
      items = items.map((item) => (item.readAt === null && item.createdAt <= upTo ? { ...item, readAt: now() } : item))
    },
  }
}
