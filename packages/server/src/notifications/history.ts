import { isJsonObject, jsonProblem, type JsonObject } from './json-value'

/**
 * A notification as the history keeps it for its user's inbox: what a panel shows of it. `title` and `body` are plain
 * text; `url` is where it leads; `data` is the app's own JSON.
 */
export type NewNotification = { title: string; body: string | null; url: string | null; data: JsonObject | null }

/** A kept notification: whose it is, its id, when it was recorded and when its user read it, `null` while unread. */
export type StoredNotification = NewNotification & { id: string; userId: string; createdAt: Date; readAt: Date | null }

/** Where a page of the history ends: the last entry's creation time and id. The next page starts after it. */
export type HistoryPosition = { createdAt: Date; id: string }

/** What an entry id looks like in every history store: it goes into a path, so no `/`, `.`, `?`, `#` or `%`. */
export const historyIdPattern = /^[A-Za-z0-9_-]{1,64}$/

/** The longest title, body and url, as a push message takes them, and the most bytes of `data` as JSON. */
export const historyLimits = { title: 256, body: 2048, url: 2048, dataBytes: 4096 } as const

const noControls = /^[^\u0000-\u001f\u007f]*$/
// Newlines and tabs are text in a body; other control characters are not.
const noControlsButLines = /^[^\u0000-\u0008\u000b-\u001f\u007f]*$/

const text = (value: unknown, max: number, pattern: RegExp) => typeof value === 'string' && value.length <= max && pattern.test(value)

// The first field of the notification that is not within its format, or `undefined`.
const notificationProblem = (notification: NewNotification) => {
  if (typeof notification !== 'object' || notification === null) return 'notification'
  if (!text(notification.title, historyLimits.title, noControls) || notification.title === '') return 'title'
  if (notification.body !== null && !text(notification.body, historyLimits.body, noControlsButLines)) return 'body'
  if (notification.url !== null && !text(notification.url, historyLimits.url, noControls)) return 'url'
  if (notification.data === null) return undefined
  if (!isJsonObject(notification.data) || jsonProblem(notification.data, '') !== undefined) return 'data'
  if (Buffer.byteLength(JSON.stringify(notification.data)) > historyLimits.dataBytes) return 'data'
  return undefined
}

/**
 * The notification as a new object with its four fields alone, or an error naming the first field at fault, never its
 * value: a title of 1 to 256 characters, a body and a url of at most 2048, without control characters, and `data`
 * plain JSON of at most 4096 bytes. Every history store records only what this accepts.
 */
export const checkedNotification = (notification: NewNotification): NewNotification => {
  const problem = notificationProblem(notification)
  if (problem !== undefined) throw new Error(`The history cannot keep this notification: its ${problem} is invalid`)
  const { title, body, url, data } = notification
  return { title, body, url, data: data === null ? null : structuredClone(data) }
}
