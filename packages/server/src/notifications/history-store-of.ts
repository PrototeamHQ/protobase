import type { Db } from '@protobase/query'
import type { AdminAuth } from '../better-auth/create-auth'
import type { HistoryStore } from './history-store'
import type { NotificationsOptions } from './options'
import { postgresHistoryStore } from './postgres-history-store'

/**
 * The history's store `notifications()` configures: the app's own `historyStore`, or the history table in `db`. An app
 * that deletes users without Protobase's auth calls its `removeAllForUser` as it deletes one.
 */
export const historyStore = (db: Db, options: NotificationsOptions = {}) => options.historyStore ?? postgresHistoryStore(db, options)

/** Has `auth` remove a user's history from `store` when it deletes the user, before and once more after. */
export const removeHistoryWithUsers = (auth: AdminAuth, store: HistoryStore) => {
  auth.userDeletion.set('notifications-history', (userId) => store.removeAllForUser(userId))
}
