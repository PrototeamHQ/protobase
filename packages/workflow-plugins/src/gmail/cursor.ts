import { historyId } from './api'

/**
 * Where the trigger stands in the mailbox's history: `history_id` is the start of the next `history.list`, `offset` how
 * many messages of the first record after it were already taken, and `polled_at` the time, in seconds, of the last poll
 * that read the history, which a recovery lists mail after.
 */
export type LiveCursor = { label_id: string; history_id: string; offset: number; polled_at: number }

/**
 * A recovery from an expired history id: the mail on the label after `since`, a page of `messages.list` a poll, then
 * the history again from `resume_history_id`, which was current when the recovery began.
 */
export type RecoveryCursor = { label_id: string; polled_at: number; recovery: { since: number; page_token: string | null; resume_history_id: string } }

export type GmailCursor = LiveCursor | RecoveryCursor

/** A Gmail label id, such as `INBOX` or `Label_12`, as it goes into a query. */
export const labelId = /^[A-Za-z0-9_-]{1,100}$/

const seconds = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const historyText = (value: unknown): value is string => typeof value === 'string' && historyId.test(value)

/** The cursor a poll got back as the trigger stored it, checked field by field; one that does not fit fails the poll. */
export const readCursor = (value: unknown): GmailCursor => {
  const cursor = (value ?? {}) as Record<string, unknown>
  const label = cursor.label_id
  if (typeof label !== 'string' || !labelId.test(label) || !seconds(cursor.polled_at)) throw new Error('The Gmail trigger has a cursor it cannot read')
  if (cursor.recovery === undefined) {
    if (!historyText(cursor.history_id) || !seconds(cursor.offset)) throw new Error('The Gmail trigger has a cursor it cannot read')
    return { label_id: label, history_id: cursor.history_id, offset: cursor.offset, polled_at: cursor.polled_at }
  }
  const { since, page_token: page, resume_history_id: resume } = (cursor.recovery ?? {}) as Record<string, unknown>
  const pageFits = page === null || (typeof page === 'string' && page.length > 0 && page.length <= 1000)
  if (!seconds(since) || !pageFits || !historyText(resume)) throw new Error('The Gmail trigger has a cursor it cannot read')
  return { label_id: label, polled_at: cursor.polled_at, recovery: { since, page_token: page as string | null, resume_history_id: resume } }
}
