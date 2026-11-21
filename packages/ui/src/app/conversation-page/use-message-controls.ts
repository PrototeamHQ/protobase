import { useToast } from '../../toasts/toast-provider'
import { messageAccess, reactionAccess } from './message-access'
import type { MessageControls } from './message-controls'
import type { MessageSetup } from './message-setup'
import { reactionGroups } from './reactions'
import { text } from './messages'

type Message = { row: Record<string, unknown>; key: string; mine: boolean; body: string; onEdit: () => void; onDelete: () => void }

/** What the reader can do to one message, as `MessageControls`, by the conversation's options and their access. */
export const useMessageControls = (setup: MessageSetup, { row, key, mine, body, onEdit, onDelete }: Message): MessageControls => {
  const toast = useToast()
  const { page, me, writes } = setup
  const access = messageAccess(page, row, mine, setup.messagePermissions)
  const reacts = reactionAccess(setup.reactionPermissions)
  const groups = page.reactions ? reactionGroups(setup.reactionsOf(key), page.reactions, setup.emoji, me) : []
  const copy = () =>
    navigator.clipboard.writeText(body).then(
      () => void toast.show({ state: 'success', title: text('copied') }),
      () => void toast.show({ state: 'error', title: text('notCopied') }),
    )
  return {
    emoji: reacts.react ? setup.emoji : [],
    groups,
    onReact: writes.react && reacts.react ? (emoji) => void writes.react!(key, emoji) : undefined,
    onUnreact: writes.unreact && reacts.unreact ? (reaction) => void writes.unreact!(reaction) : undefined,
    thread: setup.threadTo?.(key),
    onCopy: body === '' ? undefined : () => void copy(),
    onEdit: access.edit ? onEdit : undefined,
    onDelete: access.delete ? onDelete : undefined,
  }
}
