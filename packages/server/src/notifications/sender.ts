import { deviceKinds, type Device, type DeviceKind } from './device'
import type { PushMessage } from './message'
import { isPublicKey } from './web-push/keys'

/**
 * What a sender answers for one device: `ok` when the push service took the message, `gone` when the device no longer
 * exists there and should be removed, `retry` when it may take the message later, after `retryAfterSeconds` when the
 * push service says, and `refused` when the sender never delivers to the device as it is stored, such as one whose
 * endpoint is on no known push service: it is neither retried nor removed.
 */
export type PushAnswer = { id: string; result: 'ok' | 'gone' | 'retry' | 'refused'; retryAfterSeconds?: number }

/**
 * Delivers notifications to the devices of its `kinds`, through their push service: the built-in Web Push sender, or
 * one of the app's own passed as `notifications({ senders })`, typically from a package. `send` takes a message and a
 * batch of devices of those kinds only, and answers each device by its id. A sender for `web` devices names the VAPID
 * `publicKey` browsers subscribe with, which every client may read.
 */
export type PushSender = {
  kinds: readonly DeviceKind[]
  publicKey?: string
  send: (message: PushMessage, devices: readonly Device[]) => Promise<PushAnswer[]>
}

const checkSender = (sender: PushSender, index: number, claimed: Set<DeviceKind>) => {
  const name = `notifications({ senders }): sender ${index}`
  if (typeof sender !== 'object' || sender === null || typeof sender.send !== 'function') throw new Error(`${name} has no send method`)
  if (!Array.isArray(sender.kinds) || sender.kinds.length === 0) throw new Error(`${name} names no kinds: ${deviceKinds.join(', ')}`)
  for (const kind of sender.kinds) {
    if (!(deviceKinds as readonly string[]).includes(kind)) throw new Error(`${name} names a kind that is none of ${deviceKinds.join(', ')}`)
    if (claimed.has(kind)) throw new Error(`${name} delivers to ${kind} devices, as an earlier sender does`)
    claimed.add(kind)
  }
  // It reaches every client, so it is only ever what a public key looks like, never a secret given in its place.
  if (sender.publicKey !== undefined && !isPublicKey(sender.publicKey)) throw new Error(`${name} has a publicKey that is not a P-256 public key in base64url`)
}

/** The senders, checked: each with a send method and kinds, no kind delivered by two, and a public key when one is named. */
export const checkSenders = (senders: readonly PushSender[]) => {
  if (!Array.isArray(senders)) throw new Error('notifications({ senders }) is a list of senders')
  const claimed = new Set<DeviceKind>()
  senders.forEach((sender, index) => checkSender(sender, index, claimed))
  return senders
}
