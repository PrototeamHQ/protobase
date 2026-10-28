/** How close to the end, in pixels, still counts as reading the newest message. */
export const endSlack = 24

/**
 * Where a reader was in a chat: at its end or not, its first message, the top of the message they were reading, and the
 * follow key it had then.
 */
export type ThreadPlace<E> = { atEnd: boolean; first: E | undefined; anchor?: { element: E; top: number }; followKey?: unknown }

/** How far below the top of the box, in pixels, a chat opens its "New messages" line. */
export const newLineMargin = 16

/** Whether a scroll box shows its end. */
export const isAtEnd = (box: { scrollTop: number; scrollHeight: number; clientHeight: number }) => box.scrollHeight - box.scrollTop - box.clientHeight <= endSlack

/**
 * The scroll position a chat takes once its messages or follow key changed, or `undefined` to stay put. A changed follow
 * key, such as the reader sending a message, goes to the end wherever the reader was. A chat that gets its first
 * messages opens with its "New messages" line near the top, when it has one at `newLineTop` below the top of the box,
 * and at the end otherwise. Messages loaded before the first
 * keep the reader on the message they were reading, moved by as much as it moved; otherwise a reader at the end follows
 * the newest message, and one who scrolled back stays where they are.
 */
export const scrollAfterChange = <E>(
  before: ThreadPlace<E>,
  now: { first: E | undefined; anchorTop: number | undefined; scrollTop: number; scrollHeight: number; followKey?: unknown; newLineTop?: number },
) => {
  if (now.followKey !== before.followKey) return now.scrollHeight
  if (before.first === undefined && now.first !== undefined && now.newLineTop !== undefined) return Math.max(0, now.scrollTop + now.newLineTop - newLineMargin)
  if (before.first !== undefined && now.first !== before.first && before.anchor && now.anchorTop !== undefined) return now.scrollTop + now.anchorTop - before.anchor.top
  if (before.atEnd) return now.scrollHeight
  return
}
