import { apnsSender } from '../notifications/apns/apns-sender'
import { readApnsSettings } from '../notifications/apns/apns-settings'
import { fcmSender } from '../notifications/fcm/fcm-sender'
import { readFcmSettings } from '../notifications/fcm/fcm-settings'
import type { PushSender } from '../notifications/sender'
import type { PushRelayOptions } from './options'

/** The relay's senders by device kind. */
export type RelaySenders = { apns?: PushSender; fcm?: PushSender }

/**
 * The senders the relay delivers with, from the APNs and FCM variables the built-in senders read, APNs sending to
 * `appId`. Neither set stops startup: a relay without them could deliver nothing.
 */
export const relaySenders = (options: PushRelayOptions, env: Record<string, string | undefined>): RelaySenders => {
  const apns = readApnsSettings(env)
  const fcm = readFcmSettings(env)
  if (!apns && !fcm) throw new Error('pushRelay needs the APNs key (PROTOBASE_APNS_KEY, PROTOBASE_APNS_KEY_ID, PROTOBASE_APNS_TEAM_ID) or the FCM service account (PROTOBASE_FCM_SERVICE_ACCOUNT), or both')
  return { ...(apns && { apns: apnsSender(apns, { appId: options.appId }) }), ...(fcm && { fcm: fcmSender(fcm) }) }
}
