import type { NotificationsOptions } from './options'
import { guardedSender } from './guarded-sender'
import { checkSenders, type PushSender } from './sender'
import { readVapidSettings } from './web-push/vapid-settings'
import { webPushSender } from './web-push/web-push-sender'

// The built-in senders whose environment is set: Web Push with the VAPID variables.
const builtInSenders = (env: Record<string, string | undefined>): PushSender[] => {
  const vapid = readVapidSettings(env)
  return vapid ? [webPushSender(vapid)] : []
}

/**
 * The senders `notifications` delivers with: the app's own `senders`, which replace the built-in ones, or the
 * built-in ones whose environment is set. Each comes guarded (see `guardedSender`): the code that sends calls them only
 * through what this returns. A VAPID variable that is wrong stops startup.
 */
export const notificationSenders = (options: NotificationsOptions, env: Record<string, string | undefined> = globalThis.process?.env ?? {}) =>
  checkSenders(options.senders ?? builtInSenders(env)).map(guardedSender)

/** The VAPID public key browsers subscribe with: the web sender's, when there is one. */
export const webPushKey = (senders: readonly PushSender[]) => senders.find((sender) => sender.kinds.includes('web'))?.publicKey
