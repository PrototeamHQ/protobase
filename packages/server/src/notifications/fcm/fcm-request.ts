import type { Device } from '../device'
import { isJsonObject, mergeJson, type JsonObject, type JsonValue } from '../json-value'
import { PushMessageError, type PushMessage } from '../message'
import { tapUrl } from '@protobase/schema/internal'
import { checkFcmFields } from './platform-fields'

// Data keys FCM keeps for itself and refuses in a message.
const reservedData = /^(from|notification|message_type|google.*|gcm.*)$/i

const present = (fields: Record<string, JsonValue | undefined>): JsonObject =>
  Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as JsonObject

// The Android block from the common message: how long FCM keeps it, how soon it delivers it, what it replaces, and
// the notification's tag, sound and count.
const androidOf = (message: PushMessage): JsonObject => {
  const notification = present({ tag: message.tag, sound: message.sound, notification_count: message.badge })
  return present({
    ttl: message.ttl === undefined ? undefined : `${message.ttl}s`,
    priority: message.urgency === undefined ? undefined : message.urgency === 'high' ? 'HIGH' : 'NORMAL',
    collapse_key: message.tag,
    notification: Object.keys(notification).length > 0 ? notification : undefined,
  })
}

const checkedUrl = (value: JsonValue | undefined, field: string) => {
  if (value === undefined) return
  const url = tapUrl(value)
  if (url === undefined) throw new PushMessageError(field)
  return url
}

// FCM's data is a map of strings: a string stays as it is, any other value is its JSON.
const dataOf = (data: JsonValue | undefined) => {
  if (data === undefined) return {}
  if (!isJsonObject(data)) throw new PushMessageError('platform.fcm.data')
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]))
}

/** An HTTP v1 send request's body: FCM's message, with its string data and the device's token. */
export type FcmRequest = { message: JsonObject & { data: Record<string, string>; token: string } }

/**
 * The HTTP v1 request body for one device, from a checked message: its title and body as the notification, its data
 * and url as FCM's string data, its ttl, urgency, tag, sound and badge in the Android block, with `platform.fcm`
 * merged over them (only the fields `checkFcmFields` allows). The message's `data` may not hold a `url`: FCM's data is
 * flat, and the app opens its `url` key on tap, so only the message's `url` or `platform.fcm.data.url` names it. After
 * the merge the url and every image are checked as the message's url is, a data key FCM keeps for itself is refused,
 * the data carries the device's user as `user` over anything given, and the token is the device's own.
 */
export const fcmRequest = (message: PushMessage, device: Device): FcmRequest => {
  if (message.data !== undefined && Object.hasOwn(message.data, 'url')) throw new PushMessageError('data.url')
  const built: JsonObject = present({
    notification: present({ title: message.title, body: message.body }),
    data: { ...message.data, ...(message.url !== undefined && { url: message.url }) },
    android: androidOf(message),
  })
  const merged = mergeJson(built, checkFcmFields(message.platform?.fcm ?? {}))
  const data = dataOf(merged.data)
  const reserved = Object.keys(data).find((key) => reservedData.test(key))
  if (reserved !== undefined) throw new PushMessageError(`data.${reserved}`)
  if (data.url !== undefined) data.url = checkedUrl(data.url, 'data.url')!
  const notification = merged.notification as JsonObject
  const android = merged.android as JsonObject
  const androidNotification = android.notification as JsonObject | undefined
  if (notification.image !== undefined) notification.image = checkedUrl(notification.image, 'platform.fcm.notification.image')!
  if (androidNotification?.image !== undefined) androidNotification.image = checkedUrl(androidNotification.image, 'platform.fcm.android.notification.image')!
  return { message: { ...merged, data: { ...data, user: device.userId }, token: device.token } }
}
