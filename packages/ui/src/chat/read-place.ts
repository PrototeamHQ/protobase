import { isAtEnd, type ThreadPlace } from './thread-scroll'

type Box = { scrollTop: number; scrollHeight: number; clientHeight: number; getBoundingClientRect: () => { top: number } }
type Child = { hasAttribute: (name: string) => boolean; getBoundingClientRect: () => { top: number; bottom: number } }

/**
 * The message the reader is reading: the first whose bottom shows, or the first below the top when none shows. Never a
 * divider, since a day divider moves to the new first message when earlier ones of the same day load above it.
 */
export const readPlace = <E extends Child>(box: Box, list: { children: ArrayLike<E>; firstElementChild: E | null }, followKey: unknown): ThreadPlace<E> => {
  const top = box.getBoundingClientRect().top
  const element = Array.from(list.children).find((child) => !child.hasAttribute('data-chat-divider') && child.getBoundingClientRect().bottom > top)
  const anchor = element && { anchor: { element, top: element.getBoundingClientRect().top - top } }
  return { atEnd: isAtEnd(box), first: list.firstElementChild ?? undefined, followKey, ...anchor }
}
