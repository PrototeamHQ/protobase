import type { Device } from '../device'
import { pushMessage, PushMessageError, type PushMessage } from '../message'
import type { PushAnswer, PushSender } from '../sender'
import { apnsResult } from './answer'
import { apnsOrigin } from './apns-hosts'
import type { ApnsSettings } from './apns-settings'
import { apnsHeaders, apnsPayload, maxApnsPayloadBytes } from './payload'
import { postApns } from './post'
import { providerToken } from './provider-token'
import { apnsSessions, type ApnsConnect } from './sessions'

/** How many requests one batch has open at once. */
const concurrency = 8

// An APNs device token in lowercase hex, as devices are registered with: nothing in it can change the request's path.
const deviceToken = /^[0-9a-f]{64,200}$/
// An iOS bundle id, as devices are registered with.
const bundleId = /^[A-Za-z0-9._-]{1,155}$/

/** `appId` is the mobile app's id, the topic of every request; the others are for tests. */
export type ApnsOptions = { appId: string; connect?: ApnsConnect; now?: () => number; timeoutMs?: number }

/**
 * The built-in APNs sender: delivers to `apns` devices over HTTP/2 with token authentication, to the sandbox or
 * production origin each device records, one session per origin. It checks the message as `pushMessage` does and
 * throws before any request when it is not one. A device whose token is not lowercase hex, whose environment is neither
 * `sandbox` nor `production`, or whose app id is not `appId` is answered `refused` with no request. Each device's JSON
 * carries its user's id as `user`. It logs nothing, and its errors and answers carry no key, provider token or device token.
 */
export const apnsSender = (settings: ApnsSettings, options: ApnsOptions): PushSender => {
  if (typeof options.appId !== 'string' || !bundleId.test(options.appId)) throw new Error('The APNs sender needs the mobile app id, mobile.appId, as its topic')
  const now = options.now ?? Date.now
  const tokens = providerToken(settings, now)
  const session = apnsSessions(options.connect)

  const sendOne = async (device: Device, headers: Record<string, string>, body: string): Promise<PushAnswer> => {
    const origin = apnsOrigin(device.environment)
    if (!origin || !deviceToken.test(device.token) || device.appId !== options.appId) return { id: device.id, result: 'refused' }
    const answer = await postApns(session(origin), `/3/device/${device.token}`, { ...headers, authorization: `bearer ${tokens.token()}` }, body, options.timeoutMs)
    if (answer?.reason === 'ExpiredProviderToken') tokens.reset()
    return { id: device.id, ...apnsResult(answer) }
  }

  const send = async (given: PushMessage, devices: readonly Device[]) => {
    const message = pushMessage(given)
    if (devices.some((device) => device.kind !== 'apns')) throw new Error('The APNs sender was given a device that is not an apns device')
    const headers = apnsHeaders(message, options.appId, Math.floor(now() / 1000))
    const payload = apnsPayload(message)
    // Each device's JSON names the user it is for, over anything the message gave.
    const bodies = new Map(devices.map((device) => [device.id, JSON.stringify({ ...payload, user: device.userId })]))
    if ([...bodies.values()].some((body) => Buffer.byteLength(body) > maxApnsPayloadBytes)) throw new PushMessageError(`message: its APNs payload is over ${maxApnsPayloadBytes} bytes`)
    const answers: PushAnswer[] = []
    for (let start = 0; start < devices.length; start += concurrency) {
      answers.push(...(await Promise.all(devices.slice(start, start + concurrency).map((device) => sendOne(device, headers, bodies.get(device.id)!)))))
    }
    return answers
  }

  return { kinds: ['apns'], send }
}
