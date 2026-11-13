import type { ChatAuthor } from '../../chat'
import { chatDayLabel, sameChatDay } from '../../chat/chat-day'
import type { ToolCall } from './tool-calls'

type Row = Record<string, unknown>

export type ThreadFields = { key: (row: Row) => string; sender: string; time: string; text: string; status?: string }

/** A message record of a thread with its time, read to order it among the thread's tool calls. */
export type MessageRow = { kind: 'message'; row: Row; time: string | undefined }

/** The message records of a thread with the time each was sent, in the order read. */
export const messageRows = (rows: Row[], time: string): MessageRow[] => rows.map((row) => ({ kind: 'message', row, time: typeof row[time] === 'string' ? (row[time] as string) : undefined }))

/**
 * One line of a thread: a day's divider, a message under its sender, `continued` after one of theirs that day, with its
 * status when it has one, or a tool call.
 */
export type ThreadItem =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'message'; key: string; author: ChatAuthor; time: string | undefined; text: string; status?: string; continued: boolean }
  | ToolCall

// A relation comes named as `{ id, name }` (`withLabels`); any other sender is its own name
const authorOf = (value: unknown): ChatAuthor => {
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const { id, name } = value as { id: unknown; name?: unknown }
    return { id: String(id), ...(typeof name === 'string' && { name }) }
  }
  return { id: String(value ?? ''), ...(typeof value === 'string' && { name: value }) }
}

/**
 * The messages and tool calls of a thread, read newest first, as its lines oldest first: a day divider above each day's
 * first item, and a message that follows its sender's on the same day, with no tool call between, drawn as continued.
 */
export const threadItems = (newestFirst: (MessageRow | ToolCall)[], { key, sender, text, status }: ThreadFields, now = Date.now()): ThreadItem[] => {
  const items: ThreadItem[] = []
  let previous: { author: string | undefined; time: string | undefined } | undefined
  for (const entry of [...newestFirst].reverse()) {
    const sent = entry.time
    const sameDay = previous?.time !== undefined && sent !== undefined && sameChatDay(previous.time, sent)
    if (sent !== undefined && !sameDay) items.push({ kind: 'day', key: `day:${entry.kind === 'call' ? entry.key : key(entry.row)}`, label: chatDayLabel(sent, now) })
    if (entry.kind === 'call') {
      items.push(entry)
      previous = { author: undefined, time: sent }
      continue
    }
    const { row } = entry
    const author = authorOf(row[sender])
    const state = status === undefined || row[status] == null || row[status] === '' ? undefined : String(row[status])
    items.push({ kind: 'message', key: key(row), author, time: sent, text: row[text] == null ? '' : String(row[text]), ...(state !== undefined && { status: state }), continued: sameDay && previous?.author === author.id })
    previous = { author: author.id, time: sent }
  }
  return items
}
