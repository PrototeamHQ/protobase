import { useEffect, useMemo } from 'react'
import type { ConversationTyping } from './conversation-typing'
import { typingSender } from './typing'

const clock = { now: () => Date.now(), setTimer: (run: () => void, ms: number) => { const timer = setTimeout(run, ms); return () => clearTimeout(timer) } }

const nothing = { onText: () => {}, onSent: () => {} }

/**
 * Tells the others while the reader types in a box (see `typingSender`), in the thread of that first message's key, or
 * outside threads for null: `onText` with the box's text as it changes, `onSent` once a message went. Nothing without
 * `typing`.
 */
export const useTypingBox = (typing: ConversationTyping | undefined, thread: string | number | null) => {
  const send = typing?.send
  const sender = useMemo(() => (send ? typingSender((on) => send({ typing: on, thread }), clock) : undefined), [send, thread])
  // Leaving the box while typing says the reader stopped.
  useEffect(() => () => sender?.onSent(), [sender])
  return sender ?? nothing
}
