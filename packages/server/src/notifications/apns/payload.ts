import { mergeJson, type JsonObject } from '../json-value'
import { maxTtlSeconds, PushMessageError, type PushMessage, type Urgency } from '../message'
import { tapUrl } from '@protobase/schema/internal'

/** The most a notification's JSON may hold for APNs. */
export const maxApnsPayloadBytes = 4096

// APNs's priorities: 10 delivers at once, 5 when it saves the device's power, 1 when the device is next awake anyway.
const priorities: Record<Urgency, string> = { 'very-low': '1', low: '5', normal: '10', high: '10' }

/**
 * The APNs headers from a checked message, set by the sender alone: the topic is the app's id, the push type `alert`,
 * the priority from `urgency`, the expiration from `ttl` (28 days without one, as Web Push), and the collapse id from
 * `tag`. Nothing in `platform.apns` reaches them.
 */
export const apnsHeaders = (message: PushMessage, appId: string, nowSeconds: number) => {
  const ttl = message.ttl ?? maxTtlSeconds
  return {
    'apns-topic': appId,
    'apns-push-type': 'alert',
    'apns-priority': priorities[message.urgency ?? 'high'],
    'apns-expiration': ttl === 0 ? '0' : String(nowSeconds + ttl),
    ...(message.tag !== undefined && { 'apns-collapse-id': message.tag }),
  }
}

/**
 * The JSON an iOS device gets, from a checked message: `aps` with its alert, badge and sound, and the url and data the
 * app reads on tap, with `platform.apns` merged over them. The url is checked again after the merge, as the message's is.
 */
export const apnsPayload = (message: PushMessage): JsonObject => {
  const alert: JsonObject = { title: message.title }
  if (message.body !== undefined) alert.body = message.body
  const aps: JsonObject = { alert }
  if (message.badge !== undefined) aps.badge = message.badge
  if (message.sound !== undefined) aps.sound = message.sound
  const common: JsonObject = { aps }
  if (message.url !== undefined) common.url = message.url
  if (message.data !== undefined) common.data = message.data
  const payload = mergeJson(common, message.platform?.apns ?? {})
  if (payload.url === undefined) return payload
  const url = tapUrl(payload.url)
  if (url === undefined) throw new PushMessageError('platform.apns.url')
  return { ...payload, url }
}
