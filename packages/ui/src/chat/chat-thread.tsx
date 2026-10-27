import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Button } from '../primitives/button'
import { isAtEnd, scrollAfterChange, type ThreadPlace } from './thread-scroll'
import { text } from './messages'

export type ChatThreadProps = {
  children: ReactNode
  /** Shown centred while the chat is empty. */
  empty?: ReactNode
  /** The number of messages, which changes whenever the chat grows. */
  length: number
  /** Loads the messages before the first, offered as a button at the top while given. */
  onLoadEarlier?: () => void
  /** The earlier messages are on their way. */
  loadingEarlier?: boolean
  /** Changes when the reader sends a message, such as a count of their sends: each change goes to the end wherever they were, and the message that arrives next follows. */
  followKey?: string | number
}

/** The message the reader is reading: the first whose bottom shows. */
const readPlace = (box: HTMLElement, list: HTMLElement, followKey: unknown): ThreadPlace<Element> => {
  const top = box.getBoundingClientRect().top
  const element = [...list.children].find((child) => child.getBoundingClientRect().bottom > top)
  const anchor = element && { anchor: { element, top: element.getBoundingClientRect().top - top } }
  return { atEnd: isAtEnd(box), first: list.firstElementChild ?? undefined, followKey, ...anchor }
}

/**
 * The scrolling list of a chat's messages. A reader at the end follows new messages; one who scrolled back stays where
 * they are until `followKey` changes, and earlier messages loaded above keep them on the message they were reading. It
 * scrolls inside itself, not with the page, since a chat keeps its composer in view beneath it.
 */
export const ChatThread = ({ children, empty, length, onLoadEarlier, loadingEarlier, followKey }: ChatThreadProps) => {
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const place = useRef<ThreadPlace<Element>>({ atEnd: true, first: undefined, followKey })
  const remember = () => {
    if (box.current && list.current) place.current = readPlace(box.current, list.current, followKey)
  }

  useLayoutEffect(() => {
    const element = box.current
    if (!element || !list.current) return
    const before = place.current
    const anchorTop = before.anchor && before.anchor.element.isConnected ? before.anchor.element.getBoundingClientRect().top - element.getBoundingClientRect().top : undefined
    const next = scrollAfterChange(before, { first: list.current.firstElementChild ?? undefined, anchorTop, scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, followKey })
    if (next !== undefined) element.scrollTop = next
    remember()
  }, [length, followKey])

  // A chat that shows its end keeps showing it as it or its messages change size, such as a composer growing beneath it
  useEffect(() => {
    const element = box.current
    if (!element || !list.current) return
    const observer = new ResizeObserver(() => {
      if (place.current.atEnd) element.scrollTop = element.scrollHeight
    })
    observer.observe(element)
    observer.observe(list.current)
    return () => observer.disconnect()
  }, [])

  const showsEmpty = length === 0 && Boolean(empty)
  return (
    <div ref={box} onScroll={remember} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 [overflow-anchor:none]">
      {onLoadEarlier && (
        <Button size="sm" className="self-center" loading={loadingEarlier} onClick={onLoadEarlier}>
          {text('loadEarlier')}
        </Button>
      )}
      {showsEmpty && <div className="m-auto max-w-60 text-center text-muted-foreground">{empty}</div>}
      <div ref={list} role="log" aria-live="polite" className={cn('flex flex-col gap-4', showsEmpty && 'hidden')}>
        {children}
      </div>
    </div>
  )
}
