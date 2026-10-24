import { FatalJobError } from '../jobs/run-job'
import type { Device } from './device'
import type { DeviceStore } from './device-store'
import { PushSenderError } from './guarded-sender'
import type { NewNotification } from './history'
import { PushMessageError } from './message'
import type { Progress } from './push-payload'
import type { PushAnswer, PushSender } from './sender'
import { historyEntry, type CheckedSend } from './send-input'
import { NotificationStoreError, storeCall } from './store-call'

/** What a try of a send acts through: the job's stores, its senders and its hold on the job. */
export type DeliverySteps = {
  devices: DeviceStore
  /** Guarded senders, at most one for each kind (see `notificationSenders`). */
  senders: readonly PushSender[]
  /** Keeps the entry in the user's history and saves `progress`, which marks the user recorded, as one step where the store allows. */
  record: (userId: string, entry: NewNotification, progress: Progress) => Promise<void>
  /** Saves the progress for the next try. */
  save: (progress: Progress) => Promise<void>
  /** Throws unless this try still holds the job, so a try whose time ran out pushes nothing more. */
  hold: () => Promise<void>
  /** Marks the send delivered, dropping its message. */
  complete: () => Promise<void>
}

// What a try left undone or found wrong, counted by kind and never by id.
const tally = () => ({ retried: 0, storeFailures: new Map<string, number>(), strays: new Map<string, number>(), refusedField: undefined as string | undefined })

const counted = (counts: Map<string, number>, method: string, count = 1) => counts.set(method, (counts.get(method) ?? 0) + count)

const listed = (counts: Map<string, number>) => [...counts].map(([method, count]) => `${count} in ${method}`).join(', ')

/**
 * One try of a send, resuming from `given`: for a user send, each user's history entry when the send is for the inbox
 * (once, as `record` marks it), then the user's devices as the store lists them now; for a device send, the devices
 * with those ids now. A device the store gives that is not the user's, or not one asked for, gets nothing. Each kind's
 * devices go to its sender in one batch; a kind without a sender is skipped. An answer of `gone` removes the device,
 * `retry` leaves it to the next try once and gives up on it the second time, and any other is done. A sender that
 * throws leaves its batch to the next try. The try then throws, counting what is left, so the job retries it, or
 * completes the send.
 */
export const deliver = async ({ to, message }: CheckedSend, given: Progress, steps: DeliverySteps) => {
  const progress: Progress = { recorded: [...given.recorded], done: [...given.done], retried: [...given.retried] }
  const recorded = new Set(progress.recorded)
  const done = new Set(progress.done)
  const retried = new Set(progress.retried)
  const left = tally()
  const markDone = (id: string) => {
    if (done.has(id)) return
    done.add(id)
    progress.done.push(id)
  }

  if (steps.senders.length === 0 && !('userIds' in to && to.inbox)) return steps.complete()

  const answered = async (sender: PushSender, batch: Device[]): Promise<PushAnswer[] | undefined> => {
    try {
      return await sender.send(message, batch)
    } catch (error) {
      if (error instanceof PushSenderError) return undefined
      if (!(error instanceof PushMessageError)) throw error
      left.refusedField = error.field
      return batch.map((device) => ({ id: device.id, result: 'refused' }))
    }
  }

  const settle = async (device: Device, answer: PushAnswer) => {
    if (answer.result === 'gone') await storeCall('removeGone', () => steps.devices.removeGone([device.token]))
    if (answer.result !== 'retry' || retried.has(device.id)) return markDone(device.id)
    retried.add(device.id)
    progress.retried.push(device.id)
    left.retried += 1
  }

  const push = async (devices: Device[]) => {
    for (const device of devices) if (!steps.senders.some((sender) => sender.kinds.includes(device.kind))) markDone(device.id)
    for (const sender of steps.senders) {
      const batch = devices.filter((device) => sender.kinds.includes(device.kind) && !done.has(device.id))
      if (batch.length === 0) continue
      await steps.hold()
      const answers = await answered(sender, batch)
      if (answers === undefined) left.retried += batch.length
      const byId = new Map((answers ?? []).map((answer) => [answer.id, answer]))
      for (const device of answers ? batch : []) await settle(device, byId.get(device.id) ?? { id: device.id, result: 'retry' })
      await steps.save(progress)
    }
  }

  // A store's failure for one recipient leaves the others to go on; the try counts it and is retried.
  const forRecipient = async (run: () => Promise<void>) => {
    try {
      await run()
    } catch (error) {
      if (!(error instanceof NotificationStoreError)) throw error
      counted(left.storeFailures, error.method)
    }
  }

  if ('userIds' in to) {
    for (const userId of to.userIds) {
      await forRecipient(async () => {
        if (to.inbox && !recorded.has(userId)) {
          const next = { ...progress, recorded: [...progress.recorded, userId] }
          await storeCall('record', () => steps.record(userId, historyEntry(message), next))
          recorded.add(userId)
          progress.recorded.push(userId)
        }
        const devices = await storeCall('listForUser', () => steps.devices.listForUser(userId))
        const own = devices.filter((device) => device.userId === userId)
        if (own.length < devices.length) counted(left.strays, 'listForUser', devices.length - own.length)
        await push(own)
      })
    }
  } else {
    const wanted = new Set(to.deviceIds)
    const ids = to.deviceIds.filter((id) => !done.has(id))
    if (ids.length > 0) {
      await forRecipient(async () => {
        const devices = await storeCall('listByIds', () => steps.devices.listByIds(ids))
        const asked = devices.filter((device) => wanted.has(device.id))
        if (asked.length < devices.length) counted(left.strays, 'listByIds', devices.length - asked.length)
        await push(asked)
      })
    }
  }

  if (left.refusedField !== undefined) throw new FatalJobError(`notifications.send: a sender refused the message: ${left.refusedField}`)
  const strays = left.strays.size > 0 ? `; devices the store gave that were not the recipients', which got nothing: ${listed(left.strays)}` : ''
  if (left.retried > 0 || left.storeFailures.size > 0) {
    const failures = left.storeFailures.size > 0 ? `; store failures: ${listed(left.storeFailures)}` : ''
    throw new Error(`notifications.send: ${left.retried} deliveries are retried${failures}${strays}`)
  }
  await steps.complete()
  // The rest is delivered: devices the store should not have given are reported, and the send is not tried again.
  if (strays) throw new FatalJobError(`notifications.send: delivered${strays}`)
}
