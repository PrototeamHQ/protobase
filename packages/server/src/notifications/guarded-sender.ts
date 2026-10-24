import type { Device } from './device'
import { pushMessage, PushMessageError, type PushMessage } from './message'
import type { PushAnswer, PushSender } from './sender'

const results = new Set<string>(['ok', 'gone', 'retry', 'refused'])

/** What a guarded sender throws for what its sender threw: it names the sender's index alone. */
export class PushSenderError extends Error {
  constructor(readonly index: number) {
    super(`notifications sender ${index} failed`)
  }
}

const deepFrozen = <T>(value: T): T => {
  if (typeof value !== 'object' || value === null) return value
  for (const item of Object.values(value)) deepFrozen(item)
  return Object.freeze(value)
}

const validAnswer = (answer: unknown): answer is PushAnswer => {
  if (typeof answer !== 'object' || answer === null) return false
  const { id, result, retryAfterSeconds } = answer as Record<string, unknown>
  if (typeof id !== 'string' || typeof result !== 'string' || !results.has(result)) return false
  return retryAfterSeconds === undefined || (Number.isInteger(retryAfterSeconds) && (retryAfterSeconds as number) >= 0)
}

// One answer per device of the batch, in its order: the sender's first valid answer for it, or `retry` when it gave
// none, so a sender that skips a device never removes it. Answers for devices outside the batch are dropped.
const answersFor = (batch: readonly Device[], given: unknown): PushAnswer[] => {
  const byId = new Map<string, PushAnswer>()
  for (const answer of Array.isArray(given) ? given : []) {
    if (!validAnswer(answer) || byId.has(answer.id)) continue
    byId.set(answer.id, { id: answer.id, result: answer.result, ...(answer.retryAfterSeconds !== undefined && { retryAfterSeconds: answer.retryAfterSeconds }) })
  }
  return batch.map((device) => byId.get(device.id) ?? { id: device.id, result: 'retry' })
}

/**
 * `sender` as the code that sends calls it, whether built in or the app's own: the message is checked as `pushMessage`
 * checks it, and refused before the sender sees it; the sender gets a frozen copy of it and of the devices of its kinds
 * only, and answers each of those once, as above. A sender that throws throws a `PushSenderError` naming its index,
 * never the sender's, which may carry an endpoint or a key, but for a `PushMessageError`, which names a field only.
 */
export const guardedSender = (sender: PushSender, index: number): PushSender => {
  const send = async (given: PushMessage, devices: readonly Device[]) => {
    const message = deepFrozen(pushMessage(given))
    const batch = deepFrozen(devices.filter((device) => sender.kinds.includes(device.kind)).map((device) => structuredClone(device)))
    if (batch.length === 0) return []
    let answers: unknown
    try {
      answers = await sender.send(message, batch)
    } catch (error) {
      // A message the sender refuses names the field only; anything else it throws is replaced, since it may name devices.
      if (error instanceof PushMessageError) throw error
      throw new PushSenderError(index)
    }
    return answersFor(batch, answers)
  }
  return { kinds: [...sender.kinds], ...(sender.publicKey !== undefined && { publicKey: sender.publicKey }), send }
}
