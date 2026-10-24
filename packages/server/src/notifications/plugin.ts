import type { ProjectConfig } from '../project-config'
import { checkNotificationsOptions, type NotificationsOptions } from './options'

/**
 * Notifications: `extends: [notifications()]` in `protobase.config.ts`. It keeps each user's devices, in the
 * `notifications.devices` table that `protobase migration` writes or in the `store` given, and serves the endpoints
 * through which a signed-in user registers and removes their own (`devicesPath`). It keeps each user's inbox
 * notifications in the `notifications.history` table or the `historyStore` given, and serves the endpoints through which
 * a signed-in user lists theirs and marks them read (`historyPath`). It delivers through `senders`, by default the
 * built-in ones whose environment is set (see `notificationSenders`).
 */
export const notifications = (options: NotificationsOptions = {}): ProjectConfig => ({
  name: 'protobase-notifications',
  notifications: checkNotificationsOptions(options),
})
