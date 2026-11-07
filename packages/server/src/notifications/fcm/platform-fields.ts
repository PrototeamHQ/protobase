import { isJsonObject, type JsonObject } from '../json-value'
import { PushMessageError } from '../message'

// The fields `platform.fcm` may set, by object: a nested shape names the fields its object may hold, `true` any value.
// Nothing that picks the target (`token`, `topic`, `condition`), names another platform's block (`webpush`, `apns`) or
// fires something on tap besides the checked `url` (`click_action`, `fcm_options.link`) is among them.
type Shape = { [field: string]: true | Shape }

const notification: Shape = { title: true, body: true, image: true }

const androidNotification: Shape = {
  title: true,
  body: true,
  icon: true,
  color: true,
  sound: true,
  tag: true,
  channel_id: true,
  image: true,
  ticker: true,
  sticky: true,
  notification_priority: true,
  default_sound: true,
  default_vibrate_timings: true,
  visibility: true,
  notification_count: true,
  local_only: true,
}

const fcmFields: Shape = {
  notification,
  data: true,
  android: { collapse_key: true, priority: true, ttl: true, direct_boot_ok: true, notification: androidNotification },
  fcm_options: { analytics_label: true },
}

const check = (value: JsonObject, shape: Shape, path: string) => {
  for (const [key, item] of Object.entries(value)) {
    const field = shape[key]
    if (field === undefined) throw new PushMessageError(`${path}.${key}`)
    if (field === true) continue
    if (!isJsonObject(item)) throw new PushMessageError(`${path}.${key}`)
    check(item, field, `${path}.${key}`)
  }
}

/** `platform.fcm`, refused with a `PushMessageError` naming the first field that is not one it may set. */
export const checkFcmFields = (fields: JsonObject) => {
  check(fields, fcmFields, 'platform.fcm')
  return fields
}
