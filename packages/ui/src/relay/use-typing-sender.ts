import { useEffect, useMemo } from 'react'
import { RelayRefusal } from '@protobase/client'
import { useRelay } from './relay-context'
import { typingEvent, typingSender } from './typing'

const clock = { now: () => Date.now(), setTimer: (run: () => void, ms: number) => { const timer = setTimeout(run, ms); return () => clearTimeout(timer) } }

// A refused send, such as over the event's rate or while the relay is down, is dropped: typing is short-lived.
const dropRefusal = (error: unknown) => {
  if (error instanceof RelayRefusal) return
  throw error
}

/**
 * Tells the others on the channel while the reader types (see `typingSender`): `onText` with the box's text as it
 * changes, `onSent` once a message went. Nothing without the relay, or before the channel is joined.
 */
export const useTypingSender = (channel: string) => {
  const context = useRelay()
  const sender = useMemo(
    () =>
      typingSender((typing) => {
        if (!context?.relay.joined(channel)) return false
        context.relay.send(channel, typingEvent, { typing }).catch(dropRefusal)
        return true
      }, clock),
    [context, channel],
  )
  // Leaving the conversation while typing says the reader stopped.
  useEffect(() => () => sender.onSent(), [sender])
  return sender
}
