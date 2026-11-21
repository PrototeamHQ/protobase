import type { ReactionsModel } from '@protobase/schema'

type Row = Record<string, unknown>

/**
 * One emoji under a message: its label, how many reacted with it and who, by user id, and the reader's own reaction
 * with it, if any, as the row the reactions API gave.
 */
export type ReactionGroup = { emoji: string; symbol: string; name: string; count: number; userIds: string[]; mine?: Row }

/** An emoji a conversation offers, as it stores it, draws it and names it. */
export type EmojiEntry = { emoji: string; symbol: string; name: string }

/** The emoji a conversation offers, in the order of the emoji field's values, each with its label. */
export const emojiSet = (reactions: Pick<ReactionsModel, 'labels'>, values: readonly string[]): EmojiEntry[] =>
  values.flatMap((emoji) => (Object.hasOwn(reactions.labels, emoji) ? [{ emoji, ...reactions.labels[emoji]! }] : []))

/** Reaction rows by the key of the message they answer, as text. */
export const reactionsByMessage = (rows: readonly Row[], field: string) => {
  const byMessage = new Map<string, Row[]>()
  for (const row of rows) {
    const message = String(row[field])
    byMessage.set(message, [...(byMessage.get(message) ?? []), row])
  }
  return byMessage
}

/** A message's reactions per emoji of `set`, in its order, each emoji someone reacted with once; `me` finds the reader's own. */
export const reactionGroups = (rows: readonly Row[], { user, emoji: field }: Pick<ReactionsModel, 'user' | 'emoji'>, set: readonly EmojiEntry[], me: string | undefined): ReactionGroup[] =>
  set.flatMap(({ emoji, symbol, name }) => {
    const these = rows.filter((row) => row[field] === emoji)
    if (these.length === 0) return []
    const userIds = these.map((row) => String(row[user]))
    return [{ emoji, symbol, name, count: these.length, userIds, mine: me === undefined ? undefined : these.find((row) => row[user] === me) }]
  })
