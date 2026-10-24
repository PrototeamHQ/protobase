import type { ProjectConfig } from '../project-config'
import { checkNotificationsOptions, type NotificationsOptions } from './options'

/**
 * Notifications: `extends: [notifications()]` in `protobase.config.ts`. It keeps each user's devices, in the
 * `notifications.devices` table that `protobase migration` writes or in the `store` given, and serves the endpoints
 * through which a signed-in user registers and removes their own (`devicesPath`). It delivers through `senders`, by
 * default the built-in ones whose environment is set (see `notificationSenders`).
 */
export const notifications = (options: NotificationsOptions = {}): ProjectConfig => ({
  name: 'protobase-notifications',
  notifications: checkNotificationsOptions(options),
})
