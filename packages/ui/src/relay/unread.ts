import type { RelayNotice } from '@protobase/client'

/** Unread messages by conversation key, as the sidebar counts them. */
export type UnreadCounts = Readonly<Record<string, number>>

/** What a group's unread count follows: the conversation resource and the message resource noticed on its channels. */
export type UnreadSource = { conversations: string; messages: string }

/** The key of the conversation a channel is of, or undefined for a channel of another resource. */
export const conversationKey = (channel: string, conversations: string) => (channel.startsWith(`${conversations}/`) ? channel.slice(conversations.length + 1) : undefined)

/**
 * The counts once `notice` arrived, without reading anything: one more for a new message on a conversation's channel,
 * unless the reader has it open, or sent it from this page (`own`, by message key). Anything else changes nothing.
 */
export const countNotice = (counts: UnreadCounts, notice: RelayNotice, source: UnreadSource, open: (channel: string) => boolean, own: ReadonlySet<string>): UnreadCounts => {
  if (notice.kind !== 'create' || notice.resource !== source.messages) return counts
  const key = conversationKey(notice.channel, source.conversations)
  if (key === undefined || open(notice.channel) || own.has(notice.key)) return counts
  return { ...counts, [key]: (counts[key] ?? 0) + 1 }
}

/** The counts with the open conversation read: nothing unread while the reader has it open. */
export const opened = (counts: UnreadCounts, key: string): UnreadCounts => (counts[key] ? { ...counts, [key]: 0 } : counts)

/** A key as the filter takes it: a whole number bare, anything else quoted. */
export const literal = (key: string) => (/^-?\d+$/.test(key) ? key : JSON.stringify(key))

/**
 * The filter of the unread messages of `conversations`, each after its own read position and by someone else, which the
 * count groups by conversation in the database; undefined for none. Each clause reads the index of a conversation's
 * messages by key, so the count costs what is unread, not the whole history.
 */
export const unreadFilter = (field: string, key: string, sender: string, me: string, conversations: ReadonlyArray<{ key: string; readTo: number }>) => {
  if (conversations.length === 0) return
  const after = conversations.map((conversation) => `(${field} = ${literal(conversation.key)} AND ${key} > ${conversation.readTo})`).join(' OR ')
  return `${sender} != ${JSON.stringify(me)} AND (${after})`
}
