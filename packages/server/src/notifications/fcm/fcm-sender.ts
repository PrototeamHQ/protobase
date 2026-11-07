import type { Device } from '../device'
import { pushMessage, type PushMessage } from '../message'
import type { PushAnswer, PushSender } from '../sender'
import { fcmAccessToken } from './access-token'
import { fcmRequest, type FcmRequest } from './fcm-request'
import { postFcm, type FcmPostOptions } from './fcm-post'
import type { FcmSettings } from './fcm-settings'

/** How many requests one batch has open at once. */
const concurrency = 8

/** FCM's host, fixed: a request never goes where a service account's JSON or a message says. */
export const fcmOrigin = 'https://fcm.googleapis.com'

// An FCM registration token: letters, digits, `-`, `_` and `:`, of a bounded length.
const fcmToken = /^[A-Za-z0-9_:-]{1,4096}$/

export type FcmOptions = FcmPostOptions & { now?: () => number }

/**
 * The built-in FCM sender (HTTP v1 API): delivers to `fcm` devices of the service account's Firebase project, with an
 * access token minted from its key. It checks the message as `pushMessage` does and throws before any request when it
 * is not one. A device whose token is not an FCM token is answered `refused` with no request. A request whose access
 * token FCM refuses is sent once more with a new one. When no access token can be minted it throws, and no device is
 * answered. It logs nothing, and its errors and answers carry no key, token or device token.
 */
export const fcmSender = (settings: FcmSettings, options: FcmOptions = {}): PushSender => {
  const tokens = fcmAccessToken(settings, options)
  const url = new URL(`/v1/projects/${settings.projectId}/messages:send`, fcmOrigin)

  const sendOne = async (device: Device, body: FcmRequest | undefined): Promise<PushAnswer> => {
    if (!body) return { id: device.id, result: 'refused' }
    const first = await tokens.token()
    const answer = await postFcm(url, first, body, options)
    if (answer !== 'unauthorized') return { id: device.id, ...answer }
    tokens.invalidate(first)
    const again = await postFcm(url, await tokens.token(), body, options)
    return { id: device.id, ...(again === 'unauthorized' ? { result: 'retry' } : again) }
  }

  const send = async (given: PushMessage, devices: readonly Device[]) => {
    const message = pushMessage(given)
    if (devices.some((device) => device.kind !== 'fcm')) throw new Error('The FCM sender was given a device that is not an fcm device')
    // Every device's request is built before any is sent, so a message whose FCM fields are refused sends nothing.
    const bodies = new Map(devices.filter((device) => fcmToken.test(device.token)).map((device) => [device.id, fcmRequest(message, device)]))
    const answers: PushAnswer[] = []
    for (let start = 0; start < devices.length; start += concurrency) {
      answers.push(...(await Promise.all(devices.slice(start, start + concurrency).map((device) => sendOne(device, bodies.get(device.id))))))
    }
    return answers
  }

  return { kinds: ['fcm'], send }
}
