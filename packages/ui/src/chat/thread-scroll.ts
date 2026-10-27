/** How close to the end, in pixels, still counts as reading the newest message. */
export const endSlack = 24

/** Where a reader was in a chat: at its end or not, its first message, and the top of the message they were reading. */
export type ThreadPlace<E> = { atEnd: boolean; first: E | undefined; anchor?: { element: E; top: number } }

/** Whether a scroll box shows its end. */
export const isAtEnd = (box: { scrollTop: number; scrollHeight: number; clientHeight: number }) => box.scrollHeight - box.scrollTop - box.clientHeight <= endSlack

/**
 * The scroll position a chat takes once its messages changed, or `undefined` to stay put. Messages loaded before the
 * first keep the reader on the message they were reading, moved by as much as it moved; otherwise a reader at the end
 * follows the newest message, and one who scrolled back stays where they are.
 */
export const scrollAfterChange = <E>(before: ThreadPlace<E>, now: { first: E | undefined; anchorTop: number | undefined; scrollTop: number; scrollHeight: number }) => {
  if (before.first !== undefined && now.first !== before.first && before.anchor && now.anchorTop !== undefined) return now.scrollTop + now.anchorTop - before.anchor.top
  if (before.atEnd) return now.scrollHeight
  return
}
