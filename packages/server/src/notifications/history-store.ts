import type { HistoryPosition, NewNotification, StoredNotification } from './history'

/** The most unread notifications `countUnread` counts: a bell shows "99+" past it. */
export const maxUnreadCount = 100

/**
 * Where each user's inbox notifications are kept: the Postgres default (`postgresHistoryStore`), or a store of the
 * app's own passed as `notifications.historyStore`. Plain data in and out, so any store can implement it. Every
 * method takes the user and touches that user's entries alone; each throws on an empty user id or id.
 */
export type HistoryStore = {
  /** Keeps the notification for `userId`, unread, created now, under a new id matching `historyIdPattern`. */
  record: (userId: string, notification: NewNotification) => Promise<StoredNotification>
  /** At most `limit` of the user's entries, newest first by creation time then id, starting after `before`. */
  list: (userId: string, page: { before?: HistoryPosition; limit: number }) => Promise<StoredNotification[]>
  /** How many of the user's entries are unread, counting up to `maxUnreadCount` at most. */
  countUnread: (userId: string) => Promise<number>
  /** Marks the user's entry with this id read now, unless it was read already; false when the user has none such. */
  markRead: (userId: string, id: string) => Promise<boolean>
  /** Marks the user's unread entries created at or before `upTo` read now; entries read already keep their time. */
  markAllRead: (userId: string, upTo: Date) => Promise<void>
  /** Removes every entry of the user, as when the user is deleted. */
  removeAllForUser: (userId: string) => Promise<void>
}

const methods = ['record', 'list', 'countUnread', 'markRead', 'markAllRead', 'removeAllForUser'] as const satisfies readonly (keyof HistoryStore)[]

/** The store, checked to have every method; a missing one is an error naming it. */
export const checkHistoryStore = (store: HistoryStore) => {
  const missing = methods.find((method) => typeof (store as Partial<HistoryStore>)[method] !== 'function')
  if (missing !== undefined) throw new Error(`notifications.historyStore: the history store has no ${missing} method`)
  return store
}

/** The most entries `list` gives at once. */
export const maxHistoryPage = 50

/** The value, refused when empty: no store call may be read as "every user". */
export const requiredText = (name: string, value: string) => {
  if (typeof value !== 'string' || value === '') throw new Error(`The history store needs a ${name}`)
  return value
}

/** The time, refused when it is no valid `Date`. */
export const requiredTime = (name: string, value: Date) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error(`The history store needs a ${name}`)
  return value
}

/** The page asked for, refused unless its limit is a whole number from 1 to `maxHistoryPage` and its position whole. */
export const requiredPage = (page: { before?: HistoryPosition; limit: number }) => {
  if (typeof page !== 'object' || page === null || !Number.isInteger(page.limit) || page.limit < 1 || page.limit > maxHistoryPage) throw new Error(`The history store needs a page limit from 1 to ${maxHistoryPage}`)
  if (page.before === undefined) return page
  requiredTime('position time', page.before.createdAt)
  requiredText('position id', page.before.id)
  return page
}
