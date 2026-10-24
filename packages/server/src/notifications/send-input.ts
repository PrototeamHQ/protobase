import { notificationProblem, type NewNotification } from './history'
import { pushMessage, PushMessageError, type PushMessage } from './message'

/** The most users or devices one send reaches. */
export const maxRecipients = 1000

/** The most bytes a checked message takes as JSON. */
export const maxMessageBytes = 16_384

/**
 * Who a send reaches: users, saying whether it shows in their inbox, or devices by id, which it is only pushed to.
 * `inbox` is required on a user send and refused on a device send.
 */
export type NotificationRecipients = { userIds: readonly string[]; inbox: boolean; deviceIds?: never } | { deviceIds: readonly string[]; userIds?: never; inbox?: never }

/** A send as the job takes it: each id once, and the message as `pushMessage` writes it. */
export type CheckedSend = { to: { userIds: string[]; inbox: boolean } | { deviceIds: string[] }; message: PushMessage }

/** A send that is not one `checkedSend` accepts: `field` names the part at fault, never its value. */
export class NotificationSendError extends Error {
  constructor(readonly field: string) {
    super(`The notification cannot be sent: its ${field} is invalid`)
  }
}

// An id as a store takes it: text without control characters, at most 256 characters.
const idPattern = /^[^\u0000-\u001f\u007f]{1,256}$/

/** Whether `value` is an object literal, so its keys are all it holds. */
export const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))

const checkedIds = (value: unknown, field: string) => {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxRecipients) throw new NotificationSendError(field)
  if (!value.every((id) => typeof id === 'string' && idPattern.test(id))) throw new NotificationSendError(field)
  return [...new Set(value as string[])]
}

// The keys of `to` beyond those of its kind: none is allowed, `inbox` on a device send among them.
const checkedKeys = (to: Record<string, unknown>, allowed: readonly string[]) => {
  const unknown = Object.keys(to).find((key) => !allowed.includes(key))
  if (unknown !== undefined) throw new NotificationSendError(`to.${unknown}`)
}

const checkedRecipients = (to: unknown): CheckedSend['to'] => {
  if (!isPlainRecord(to)) throw new NotificationSendError('to')
  if (Object.hasOwn(to, 'userIds') && Object.hasOwn(to, 'deviceIds')) throw new NotificationSendError('to')
  if (Object.hasOwn(to, 'deviceIds')) {
    checkedKeys(to, ['deviceIds'])
    return { deviceIds: checkedIds(to.deviceIds, 'to.deviceIds') }
  }
  if (!Object.hasOwn(to, 'userIds')) throw new NotificationSendError('to')
  checkedKeys(to, ['userIds', 'inbox'])
  // Strictly a boolean: "false", 0 or null must not put a push in the inbox by truthiness.
  if (typeof to.inbox !== 'boolean') throw new NotificationSendError('to.inbox')
  return { userIds: checkedIds(to.userIds, 'to.userIds'), inbox: to.inbox }
}

const checkedMessage = (message: unknown) => {
  let checked: PushMessage
  try {
    checked = pushMessage(message as PushMessage)
  } catch (error) {
    if (!(error instanceof PushMessageError)) throw error
    throw new NotificationSendError(error.field === 'message' ? 'message' : `message.${error.field}`)
  }
  if (Buffer.byteLength(JSON.stringify(checked)) > maxMessageBytes) throw new NotificationSendError('message')
  return checked
}

/** The entry a user's history keeps of a checked message. */
export const historyEntry = (message: PushMessage): NewNotification => ({ title: message.title, body: message.body ?? null, url: message.url ?? null, data: message.data ?? null })

/**
 * The send, checked, or a `NotificationSendError` naming the first field at fault: recipients of one kind, 1 to
 * `maxRecipients` ids, a user send's `inbox` a boolean, and a message `pushMessage` accepts, its url an absolute `http`
 * or `https` URL written as the parser writes it, of at most `maxMessageBytes`. For the inbox, the message must also be
 * one the history keeps.
 */
export const checkedSend = (to: unknown, message: unknown): CheckedSend => {
  const recipients = checkedRecipients(to)
  const checked = checkedMessage(message)
  if ('userIds' in recipients && recipients.inbox) {
    const problem = notificationProblem(historyEntry(checked))
    if (problem !== undefined) throw new NotificationSendError(`message.${problem}`)
  }
  return { to: recipients, message: checked }
}
