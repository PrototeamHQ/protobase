import type { Device } from '../notifications/device'
import type { PushMessage } from '../notifications/message'
import type { RelayDevice, RelayResult } from '../notifications/relay/relay-protocol'
import type { RelaySenders } from './senders'
import { stampOrigin } from './stamp'
import type { RelayBinding } from './store'

// The device a sender takes for a binding: the handle as its id, so each answer names its handle.
const deviceOf = (binding: RelayBinding, user: string, appId: string): Device => ({
  id: binding.handle,
  userId: user,
  kind: binding.kind,
  token: binding.token,
  p256dh: null,
  auth: null,
  environment: binding.environment,
  appId,
  userAgent: null,
  sessionId: null,
  createdAt: new Date(0),
  lastSeenAt: new Date(0),
})

export type RelayDelivery = { message: PushMessage; origin: string; devices: readonly RelayDevice[]; bindings: readonly RelayBinding[] }

/**
 * Delivers a checked message to the devices whose handle is bound to `origin`, with that origin stamped into it, and
 * answers each handle: `refused` for one unknown, bound to another origin or of a kind the relay has no sender for, and
 * the sender's answer for the others. A handle named twice is sent to once.
 */
export const deliver = async (senders: RelaySenders, appId: string, { message, origin, devices, bindings }: RelayDelivery) => {
  const bound = new Map(bindings.filter((binding) => binding.origin === origin).map((binding) => [binding.handle, binding]))
  const results = new Map<string, RelayResult>()
  const batches = { apns: [] as Device[], fcm: [] as Device[] }
  const seen = new Set<string>()
  for (const { handle, user } of devices) {
    if (seen.has(handle)) continue
    seen.add(handle)
    const binding = bound.get(handle)
    if (!binding || !senders[binding.kind]) results.set(handle, 'refused')
    else batches[binding.kind].push(deviceOf(binding, user, appId))
  }
  const stamped = stampOrigin(message, origin)
  for (const kind of ['apns', 'fcm'] as const) {
    if (batches[kind].length === 0) continue
    for (const answer of await senders[kind]!.send(stamped, batches[kind])) results.set(answer.id, answer.result)
  }
  return results
}
