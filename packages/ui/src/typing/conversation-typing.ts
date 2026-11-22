import type { TypingPayload } from './typing'

/** A conversation's typing over the channel that carries it, the relay's or the record's own. */
export type ConversationTyping = {
  /** Who else types in the thread of that first message's key, or outside threads for null, by user id. */
  typers: (thread: string | null) => string[]
  /** Tells the others the reader types or stopped; false when it cannot go now, such as before the channel is joined. */
  send: (payload: TypingPayload) => boolean
}

/**
 * Which channel carries a conversation page's `typing`: the realtime relay's when the app has one, else the record's own
 * channel (`client.channel`); none without `typing` or for a visitor, who is nobody to name.
 */
export const typingTransport = (typing: boolean | undefined, relay: boolean, me: string | undefined) => {
  if (!typing || me === undefined) return
  return relay ? ('relay' as const) : ('record' as const)
}
