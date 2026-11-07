import type { MobileConfig } from '../mobile-config'
import { apnsSender } from './apns/apns-sender'
import { readApnsSettings } from './apns/apns-settings'
import type { NotificationsOptions } from './options'
import { guardedSender } from './guarded-sender'
import { checkSenders, type PushSender } from './sender'
import { readVapidSettings } from './web-push/vapid-settings'
import { webPushSender } from './web-push/web-push-sender'

// The built-in senders whose environment is set: Web Push with the VAPID variables, APNs with the APNs variables and
// the mobile app's id as its topic.
const builtInSenders = (env: Record<string, string | undefined>, mobile: MobileConfig | undefined): PushSender[] => {
  const vapid = readVapidSettings(env)
  const apns = readApnsSettings(env)
  if (apns && !mobile?.appId) throw new Error('PROTOBASE_APNS_KEY, PROTOBASE_APNS_KEY_ID and PROTOBASE_APNS_TEAM_ID are set, but the config has no mobile.appId, which APNs sends to; add the mobile section, or unset them')
  return [...(vapid ? [webPushSender(vapid)] : []), ...(apns ? [apnsSender(apns, { appId: mobile!.appId })] : [])]
}

/**
 * The senders `notifications` delivers with: the app's own `senders`, which replace the built-in ones, or the
 * built-in ones whose environment is set. Each comes guarded (see `guardedSender`): the code that sends calls them only
 * through what this returns. A VAPID or APNs variable that is wrong, or APNs without `mobile.appId`, stops startup.
 */
export const notificationSenders = (options: NotificationsOptions, env: Record<string, string | undefined> = globalThis.process?.env ?? {}, mobile?: MobileConfig) =>
  checkSenders(options.senders ?? builtInSenders(env, mobile)).map(guardedSender)

/** The VAPID public key browsers subscribe with: the web sender's, when there is one. */
export const webPushKey = (senders: readonly PushSender[]) => senders.find((sender) => sender.kinds.includes('web'))?.publicKey
