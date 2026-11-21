import { Button, buttonClass } from '../../primitives/button'
import { ResponsiveDialog } from '../../primitives/responsive-dialog'
import { AppLink } from '../use-app-address'
import type { MessageControls } from './message-controls'
import { text } from './messages'

type Props = {
  controls: MessageControls
  /** Names the message it acts on, such as "Message from Lena Fischer". */
  title: string
  /** The message's text, shown under the title. */
  preview: string
  onClose: () => void
}

/**
 * What the reader can do to a message, opened by a finger's tap or long-press on it, under a line of the message: a row
 * of every emoji, those they reacted with pressed, taking their reaction back as its chip does, then reply in its
 * thread, copy its text, edit and delete. A sheet from the bottom at mobile width, a dialog on a wider touch screen.
 * Each choice closes it.
 */
export const MessageActionsSheet = ({ controls, title, preview, onClose }: Props) => {
  const { emoji, groups, onReact, onUnreact, thread, onCopy, onEdit, onDelete } = controls
  const mine = new Map(groups.flatMap((group) => (group.mine ? [[group.emoji, group.mine] as const] : [])))
  const choose = (onChoose: () => void) => () => {
    onClose()
    onChoose()
  }
  // The sheet stacks its buttons from the last up, and the dialog lines them up from the left: Delete leftmost there,
  // Reply in thread on top here
  return (
    <ResponsiveDialog
      open
      title={title}
      description={preview && <span className="line-clamp-2">{preview}</span>}
      onClose={onClose}
      actions={
        <>
          {onDelete && (
            <Button variant="danger" onClick={choose(onDelete)}>
              {text('delete')}
            </Button>
          )}
          {onEdit && <Button onClick={choose(onEdit)}>{text('edit')}</Button>}
          {onCopy && <Button onClick={choose(onCopy)}>{text('copyText')}</Button>}
          {thread && (
            <AppLink to={thread} className={buttonClass()} onClick={onClose}>
              {text('replyInThread')}
            </AppLink>
          )}
        </>
      }
    >
      {emoji.length > 0 && (
      <div role="group" aria-label={text('react')} className="flex flex-wrap gap-1">
        {emoji.map(({ emoji: value, symbol, name }) => {
          const reaction = mine.get(value)
          const press = reaction ? onUnreact && (() => onUnreact(reaction)) : onReact && (() => onReact(value))
          return (
            <Button key={value} size="icon" variant={reaction ? 'secondary' : 'ghost'} aria-pressed={reaction !== undefined} aria-label={text('reactWith', { name })} disabled={!press} onClick={press && choose(press)}>
              <span aria-hidden>{symbol}</span>
            </Button>
          )
        })}
      </div>
      )}
    </ResponsiveDialog>
  )
}
