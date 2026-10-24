import type { Db } from '@protobase/query'
import type { AdminAuth } from '../better-auth/create-auth'
import type { DeviceStore } from './device-store'
import type { NotificationsOptions } from './options'
import { postgresDeviceStore } from './postgres-store'

/**
 * The devices' store `notifications()` configures: the app's own `store`, or the devices table in `db`. An app that
 * deletes users without Protobase's auth calls its `removeAllForUser` as it deletes one.
 */
export const deviceStore = (db: Db, options: NotificationsOptions = {}) => options.store ?? postgresDeviceStore(db, options)

/** Has `auth` remove a user's devices from `store` when it deletes the user, before and once more after. */
export const removeDevicesWithUsers = (auth: AdminAuth, store: DeviceStore) => {
  auth.userDeletion.set('notifications', (userId) => store.removeAllForUser(userId))
}
