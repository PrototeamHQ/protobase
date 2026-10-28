import { cn } from '../lib/cn'
import { text } from './messages'

export type ChatDividerProps =
  /** A muted line between the messages of two days, labelled with the later one, such as by `chatDayLabel`. */
  | { tone?: 'day'; label: string }
  /** A line above the first message the reader has not seen, "New messages" unless labelled otherwise. */
  | { tone: 'new'; label?: string }

/**
 * A line across a chat with a label in its middle, between the messages of two days or above the new ones. Marked
 * `data-chat-divider`, so a thread keeps the reader's place on the message below it, not on the divider.
 */
export const ChatDivider = ({ tone = 'day', label }: ChatDividerProps) => {
  const shown = label ?? text('newMessages')
  const line = cn('h-px flex-1', tone === 'new' ? 'bg-danger' : 'bg-border')
  return (
    <div role="separator" aria-label={shown} data-tone={tone} data-chat-divider="" className="flex items-center gap-3 text-xs font-medium">
      <span className={line} />
      <span className={tone === 'new' ? 'text-danger' : 'text-muted-foreground'}>{shown}</span>
      <span className={line} />
    </div>
  )
}
