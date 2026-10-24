import type { StandardSchema } from '../functions/read-json'
import { checkedSend, isPlainRecord, maxRecipients, NotificationSendError, type CheckedSend } from './send-input'

/**
 * What the tries of one send did so far: the users whose history entry is kept, the devices done with (delivered,
 * removed, refused or given up), and the devices that asked to be retried once already.
 */
export type Progress = { recorded: string[]; done: string[]; retried: string[] }

/** A send as its job keeps it: the send and its progress, or only that it is complete once delivered. */
export type PushPayload = (CheckedSend & { progress?: Progress }) | { complete: true }

export const noProgress = (): Progress => ({ recorded: [], done: [], retried: [] })

// Each list holds ids of the send's users or their devices; a user has at most a few dozen devices.
const maxProgressIds = maxRecipients * 64

const progressOf = (value: unknown): Progress | undefined => {
  if (!isPlainRecord(value)) return undefined
  const keys = Object.keys(value)
  if (keys.length !== 3 || !['recorded', 'done', 'retried'].every((key) => keys.includes(key))) return undefined
  const lists = [value.recorded, value.done, value.retried]
  if (!lists.every((list) => Array.isArray(list) && list.length <= maxProgressIds && list.every((id) => typeof id === 'string'))) return undefined
  return { recorded: [...(value.recorded as string[])], done: [...(value.done as string[])], retried: [...(value.retried as string[])] }
}

const invalid = (message: string) => ({ issues: [{ message }] })

/**
 * The payload as the send job checks it when enqueued and before each try: the send checked again as `checkedSend`
 * checks it, so a job queued around `sendNotification` is refused the same way and runs nothing.
 */
const validate = (value: unknown): { value: PushPayload } | { issues: { message: string }[] } => {
  if (!isPlainRecord(value)) return invalid('The notification send is not an object')
  if (value.complete === true && Object.keys(value).length === 1) return { value: { complete: true } }
  if (Object.keys(value).some((key) => !['to', 'message', 'progress'].includes(key))) return invalid('The notification send has a field it does not take')
  const progress = value.progress === undefined ? undefined : progressOf(value.progress)
  if (value.progress !== undefined && progress === undefined) return invalid('The notification send has an invalid progress')
  let send: CheckedSend
  try {
    send = checkedSend(value.to, value.message)
  } catch (error) {
    if (!(error instanceof NotificationSendError)) throw error
    return invalid(error.message)
  }
  return { value: { ...send, ...(progress && { progress }) } }
}

export const pushPayload: StandardSchema<PushPayload> = { '~standard': { version: 1, validate } }
