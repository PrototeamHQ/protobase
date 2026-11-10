import type { ChatAuthor } from '../../../chat'
import { chatDayLabel, sameChatDay } from '../../../chat/chat-day'

type Row = Record<string, unknown>

export type ThreadFields = { key: (row: Row) => string; sender: string; time: string; text: string }

/** One line of a thread: a day's divider, or a message under its sender, `continued` after one of theirs that day. */
export type ThreadItem =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'message'; key: string; author: ChatAuthor; time: string | undefined; text: string; continued: boolean }

// A relation comes named as `{ id, name }` (`withLabels`); any other sender is its own name
const authorOf = (value: unknown): ChatAuthor => {
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const { id, name } = value as { id: unknown; name?: unknown }
    return { id: String(id), ...(typeof name === 'string' && { name }) }
  }
  return { id: String(value ?? ''), ...(typeof value === 'string' && { name: value }) }
}

/**
 * The messages of a thread, read newest first, as its lines oldest first: a day divider above each day's first message,
 * and a message that follows its sender's on the same day drawn as continued.
 */
export const threadItems = (newestFirst: Row[], { key, sender, time, text }: ThreadFields, now = Date.now()): ThreadItem[] => {
  const items: ThreadItem[] = []
  let previous: { author: string; time: string | undefined } | undefined
  for (const row of [...newestFirst].reverse()) {
    const author = authorOf(row[sender])
    const sent = typeof row[time] === 'string' ? (row[time] as string) : undefined
    const sameDay = previous?.time !== undefined && sent !== undefined && sameChatDay(previous.time, sent)
    if (sent !== undefined && !sameDay) items.push({ kind: 'day', key: `day:${key(row)}`, label: chatDayLabel(sent, now) })
    items.push({ kind: 'message', key: key(row), author, time: sent, text: row[text] == null ? '' : String(row[text]), continued: sameDay && previous?.author === author.id })
    previous = { author: author.id, time: sent }
  }
  return items
}
