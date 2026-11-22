import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { RelayRefusal } from '@protobase/client'
import type { ConversationTyping } from '../typing/conversation-typing'
import { typersOn, typingEvent, typingSpot, type TypingPayload } from '../typing/typing'
import { useRelay } from './relay-context'

// A refused send, such as over the event's rate or while the relay is down, is dropped: typing is short-lived.
const dropRefusal = (error: unknown) => {
  if (error instanceof RelayRefusal) return
  throw error
}

const nobody = () => () => {}
const none = () => undefined

/**
 * A conversation's typing over the record's channel `<resource>/<key>` of the realtime relay, which the page joins
 * (`useViewChannel`); undefined without a channel, or without the relay, such as for a visitor.
 */
export const useRelayTyping = (channel: string | undefined): ConversationTyping | undefined => {
  const context = useRelay()
  const typers = useSyncExternalStore(context?.store.subscribe ?? nobody, context?.store.typers ?? none, context?.store.typers ?? none)
  const send = useCallback(
    (payload: TypingPayload) => {
      if (!context || channel === undefined || !context.relay.joined(channel)) return false
      context.relay.send(channel, typingEvent, payload).catch(dropRefusal)
      return true
    },
    [context, channel],
  )
  return useMemo(() => {
    if (!context || !typers || channel === undefined) return
    return { typers: (thread: string | null) => typersOn(typers, typingSpot(channel, thread), context.me), send }
  }, [context, typers, channel, send])
}
