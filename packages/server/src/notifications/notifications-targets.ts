import type { StoreNames } from '../better-auth/store/store-names'
import { historyNames, notificationsNames, type NotificationsOptions } from './options'
import { moduleNames, usersTarget } from './table-names'

/**
 * The schema modules `notifications` needs, under the names its options give them: the devices table unless a store of
 * the app's own keeps the devices, and the history table unless one keeps the history, each pointing at the users of
 * the auth store `store` names, none without sign-in.
 */
export const notificationsTargets = (options: NotificationsOptions, store: StoreNames | undefined) => {
  const users = usersTarget(store)
  return {
    ...(!options.store && { notification_devices: { names: moduleNames(notificationsNames(options), users), resources: {} } }),
    ...(!options.historyStore && { notification_history: { names: moduleNames(historyNames(options), users), resources: {} } }),
  }
}
