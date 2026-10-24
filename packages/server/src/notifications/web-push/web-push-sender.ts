import type { Device } from '../device'
import { maxTtlSeconds, pushMessage, PushMessageError, type PushMessage } from '../message'
import { isPushEndpoint } from '../push-hosts'
import type { PushAnswer, PushSender } from '../sender'
import { encryptPayload, maxPlaintextBytes, type SubscriptionKeys } from './encrypt'
import { fromBase64url, isPublicPoint } from './keys'
import { webPushPayload } from './payload'
import { postPush, type PostOptions } from './post'
import { vapidAuthorizer } from './vapid-jwt'
import type { VapidSettings } from './vapid-settings'

/** How many requests one batch has open at once. */
const concurrency = 8

export type WebPushOptions = PostOptions & { now?: () => number }

// A device's endpoint as the URL the request goes to, when it is on a browser's push service; the same object names
// the token's audience, so what was checked is what is fetched.
const endpointOf = (device: Device) => (isPushEndpoint(device.token) ? new URL(device.token) : undefined)

const keysOf = (device: Device): SubscriptionKeys | undefined => {
  const p256dh = fromBase64url(device.p256dh)
  const auth = fromBase64url(device.auth)
  return isPublicPoint(p256dh) && auth?.length === 16 ? { p256dh, auth } : undefined
}

// The Web Push headers from the common message, each replaced by its `platform.web` field when given. TTL is required:
// without one the push service keeps the message as long as it keeps any.
const headersOf = (message: PushMessage) => {
  const web = message.platform?.web
  const urgency = web?.urgency ?? message.urgency
  const topic = web?.topic ?? message.tag
  return {
    TTL: String(web?.ttl ?? message.ttl ?? maxTtlSeconds),
    ...(urgency !== undefined && { Urgency: urgency }),
    ...(topic !== undefined && { Topic: topic }),
    'Content-Type': 'application/octet-stream',
    'Content-Encoding': 'aes128gcm',
  }
}

/**
 * The built-in Web Push sender (RFC 8030, 8291, 8292): delivers to `web` devices, signed with the VAPID pair and
 * encrypted for each device's keys. It checks the message as `pushMessage` does and throws before any request when it
 * is not one. A device whose endpoint is not on a browser's push service, or whose keys are not a subscription's, is
 * answered `refused` with no request. It logs nothing, and its errors and answers carry no endpoint, key or token.
 */
export const webPushSender = (settings: VapidSettings, options: WebPushOptions = {}): PushSender => {
  const authorization = vapidAuthorizer(settings, options.now)

  const sendOne = async (device: Device, headers: Record<string, string>, plaintext: Buffer): Promise<PushAnswer> => {
    const url = endpointOf(device)
    const keys = keysOf(device)
    if (!url || !keys) return { id: device.id, result: 'refused' }
    const body = encryptPayload(plaintext, keys)
    const answer = await postPush(url, { ...headers, Authorization: authorization(url.origin) }, body, options)
    return { id: device.id, ...answer }
  }

  const send = async (given: PushMessage, devices: readonly Device[]) => {
    const message = pushMessage(given)
    if (devices.some((device) => device.kind !== 'web')) throw new Error('The Web Push sender was given a device that is not a web device')
    const headers = headersOf(message)
    const plaintext = Buffer.from(JSON.stringify(webPushPayload(message)))
    if (plaintext.length > maxPlaintextBytes) throw new PushMessageError(`message: its Web Push payload is over ${maxPlaintextBytes} bytes`)
    const answers: PushAnswer[] = []
    for (let start = 0; start < devices.length; start += concurrency) {
      answers.push(...(await Promise.all(devices.slice(start, start + concurrency).map((device) => sendOne(device, headers, plaintext)))))
    }
    return answers
  }

  return { kinds: ['web'], publicKey: settings.publicKey, send }
}
