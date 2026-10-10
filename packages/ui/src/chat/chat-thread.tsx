import { useEffect, useRef, type ReactNode } from 'react'

export type ChatThreadProps = {
  children: ReactNode
  /** Shown centred while the chat is empty. */
  empty?: ReactNode
  /** Changes whenever the chat grows, which scrolls it to the end. */
  length: number
}

/** The scrolling list of a chat's messages, kept at the newest one as messages arrive. */
export const ChatThread = ({ children, empty, length }: ChatThreadProps) => {
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = list.current
    if (element) element.scrollTop = element.scrollHeight
  }, [length])
  return (
    <div ref={list} role="log" aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      {length === 0 && empty ? <div className="m-auto max-w-60 text-center text-[13px] text-muted-foreground">{empty}</div> : children}
    </div>
  )
}
