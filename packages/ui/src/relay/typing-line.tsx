import { TypingNames } from '../typing/typing-names'
import { useTypers } from './relay-context'

/** The line above a conversation's box saying who else types on its relay channel, outside threads (see `TypingNames`). */
export const TypingLine = ({ channel }: { channel: string }) => <TypingNames users={useTypers(channel)} />
