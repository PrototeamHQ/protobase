import type { PushMessage } from '../notifications/message'

/**
 * The message with the workspace's origin written into what the phone gets, over anything the workspace gave: the
 * APNs payload's `origin`, and FCM's data `origin`. The phone opens the notification in the workspace of that origin.
 */
export const stampOrigin = (message: PushMessage, origin: string): PushMessage => {
  const platform = message.platform ?? {}
  const fcm = platform.fcm ?? {}
  const data = typeof fcm.data === 'object' && fcm.data !== null && !Array.isArray(fcm.data) ? fcm.data : {}
  return { ...message, platform: { ...platform, apns: { ...platform.apns, origin }, fcm: { ...fcm, data: { ...data, origin } } } }
}
