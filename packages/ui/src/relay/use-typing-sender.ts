import { useTypingBox } from '../typing/use-typing-box'
import { useRelayTyping } from './use-relay-typing'

/**
 * Tells the others on the relay's channel while the reader types, outside threads (see `typingSender`): `onText` with
 * the box's text as it changes, `onSent` once a message went. Nothing without the relay, or before the channel is joined.
 */
export const useTypingSender = (channel: string) => useTypingBox(useRelayTyping(channel), null)
