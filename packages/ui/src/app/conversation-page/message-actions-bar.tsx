import { Button, buttonClass } from '../../primitives/button'
import { AppLink } from '../use-app-address'
import type { MessageControls } from './message-controls'
import { text } from './messages'

/**
 * What the reader can do to a message, a bar over its top right corner shown while they point at it or move into it with
 * the keyboard, so it takes no room of its own: react with an emoji they have not reacted with yet, reply in its
 * thread, edit and delete. Only a screen that can point shows it; on a touch screen a tap or long-press opens
 * `MessageActionsSheet` instead.
 */
export const MessageActionsBar = ({ controls }: { controls: MessageControls }) => {
  const { emoji, groups, onReact, thread, onEdit, onDelete } = controls
  const reacted = new Set(groups.filter((group) => group.mine).map((group) => group.emoji))
  const offered = onReact ? emoji.filter((entry) => !reacted.has(entry.emoji)) : []
  if (offered.length === 0 && !thread && !onEdit && !onDelete) return null
  return (
    <div
      role="toolbar"
      aria-label={text('messageActions')}
      className="pointer-events-none absolute -top-3 right-0 z-10 hidden items-center gap-0.5 rounded-md border border-border bg-background p-0.5 opacity-0 shadow-sm transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 [@media(hover:hover)]:flex"
    >
      {offered.map(({ emoji: value, symbol, name }) => (
        <Button key={value} size="icon" variant="ghost" aria-label={text('reactWith', { name })} title={name} onClick={() => onReact!(value)}>
          <span aria-hidden>{symbol}</span>
        </Button>
      ))}
      {thread && (
        <AppLink to={thread} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
          {text('replyInThread')}
        </AppLink>
      )}
      {onEdit && (
        <Button size="sm" variant="ghost" onClick={onEdit}>
          {text('edit')}
        </Button>
      )}
      {onDelete && (
        <Button size="sm" variant="ghost" onClick={onDelete}>
          {text('delete')}
        </Button>
      )}
    </div>
  )
}
