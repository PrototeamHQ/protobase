import type { Device } from '../device'
import { pushMessage, type PushMessage } from '../message'
import type { PushAnswer, PushSender } from '../sender'
import type { PostOptions } from '../web-push/post'
import { postRelay } from './relay-post'
import { maxRelayDevices, relayHandle, relaySendPath } from './relay-protocol'
import type { RelaySettings } from './relay-settings'

/**
 * The built-in relay sender: delivers to `relay` devices through a push relay that holds the mobile app's push keys,
 * with `POST <relay>/send`, the workspace's credential as its bearer, and up to `maxRelayDevices` handles per request,
 * one request after another. Each device carries its user's id as `user`. It checks the message as `pushMessage` does
 * and throws before any request when it is not one. A device whose token is not a relay handle is answered `refused`
 * with no request. It logs nothing, and its errors and answers carry no credential or handle.
 */
export const relaySender = (settings: RelaySettings, options: PostOptions = {}): PushSender => {
  const url = new URL(relaySendPath, settings.url)

  const send = async (given: PushMessage, devices: readonly Device[]) => {
    const message = pushMessage(given)
    if (devices.some((device) => device.kind !== 'relay')) throw new Error('The relay sender was given a device that is not a relay device')
    const sendable = devices.filter((device) => relayHandle.test(device.token))
    const results = new Map<string, Omit<PushAnswer, 'id'>>()
    for (let start = 0; start < sendable.length; start += maxRelayDevices) {
      const batch = sendable.slice(start, start + maxRelayDevices).map((device) => ({ handle: device.token, user: device.userId }))
      for (const [handle, result] of await postRelay(url, settings.credential, { message, devices: batch }, options)) results.set(handle, result)
    }
    return devices.map((device): PushAnswer => ({ id: device.id, ...(results.get(device.token) ?? { result: 'refused' }) }))
  }

  return { kinds: ['relay'], send }
}
