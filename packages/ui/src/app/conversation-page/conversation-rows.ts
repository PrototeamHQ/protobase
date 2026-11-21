import type { ChatAuthor } from '../../chat'
import { chatDayLabel, sameChatDay } from '../../chat/chat-day'
import { authorOf } from '../conversation/thread-items'

type Row = Record<string, unknown>

/** How long after a message the same author's next one still joins it, so a quick run of messages reads as one. */
export const groupWindowMs = 5 * 60_000

export type MessageFields = { key: (row: Row) => string; sender: string; time: string }

/**
 * One line of a conversation: a day's divider, the "New messages" line, or a message under its author, `continued`
 * when it follows the same author's message of a moment ago, so it leaves out their avatar, name and time.
 */
export type ConversationRow =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'new'; key: string }
  | { kind: 'message'; key: string; row: Row; author: ChatAuthor; time: string | undefined; continued: boolean }

const timeOf = (row: Row, time: string) => (typeof row[time] === 'string' ? (row[time] as string) : undefined)

/**
 * The messages, oldest first, as the conversation's lines: a day divider above each day's first message, the "New
 * messages" line above the message keyed `newLineAbove`, and each message grouped with the one before it when the same
 * author sent both within `groupWindowMs` on the same day, with no line between.
 */
export const conversationRows = (oldestFirst: Row[], { key, sender, time }: MessageFields, newLineAbove?: string, now = Date.now()): ConversationRow[] =>
  oldestFirst.flatMap((row, index): ConversationRow[] => {
    const previous = oldestFirst[index - 1]
    const sent = timeOf(row, time)
    const before = previous && timeOf(previous, time)
    const newDay = sent !== undefined && (before === undefined || !sameChatDay(before, sent))
    const isNew = key(row) === newLineAbove
    const soon = sent !== undefined && before !== undefined && Date.parse(sent) - Date.parse(before) < groupWindowMs
    const author = authorOf(row[sender])
    const continued = !newDay && !isNew && soon && authorOf(previous![sender]).id === author.id
    return [
      ...(newDay ? [{ kind: 'day' as const, key: `day:${key(row)}`, label: chatDayLabel(sent, now) }] : []),
      ...(isNew ? [{ kind: 'new' as const, key: `new:${key(row)}` }] : []),
      { kind: 'message', key: key(row), row, author, time: sent, continued },
    ]
  })

/**
 * The key of the message the "New messages" line goes above: the first after `lastRead`, the key of the newest message
 * the reader read, by someone other than `me`; none when none is unread. When that is the first message loaded and
 * earlier ones are not, the first unread one may be among those, so there is no line rather than one in the wrong place.
 */
export const firstUnreadKey = (oldestFirst: Row[], { key, sender }: Omit<MessageFields, 'time'>, lastRead: number, me: string, hasEarlier: boolean) => {
  const index = oldestFirst.findIndex((row) => Number(key(row)) > lastRead && authorOf(row[sender]).id !== me)
  if (index === -1) return
  if (index === 0 && hasEarlier) return
  return key(oldestFirst[index]!)
}
