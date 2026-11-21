import type { AppAddress } from '@protobase/schema'
import type { EmojiEntry, ReactionGroup } from './reactions'

/**
 * What the reader can do to one message, each given only when they may: react with an emoji of `emoji`, take back
 * their own reaction, open its thread (`thread`, the address of a message of the conversation itself), copy its text,
 * edit it and delete it. The pointer's bar and the touch sheet both draw it.
 */
export type MessageControls = {
  emoji: readonly EmojiEntry[]
  groups: readonly ReactionGroup[]
  onReact?: (emoji: string) => void
  onUnreact?: (reaction: Record<string, unknown>) => void
  thread?: AppAddress
  onCopy?: () => void
  onEdit?: () => void
  onDelete?: () => void
}
