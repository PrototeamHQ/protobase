import type { ActionModel } from '@protobase/schema'
import { Button } from '../../primitives/button'
import { Dialog } from '../../primitives/dialog'
import { useActionMailbox } from '../../mailbox/use-action-mailbox'
import { text } from './messages'

/** The question an action with `confirm` asks before it runs; one that sends from the person's mailbox offers to connect it first while none is linked. */
export const ConfirmAction = ({ action, label, danger, onCancel, onConfirm }: { action: ActionModel; label: string; danger?: boolean; onCancel: () => void; onConfirm: () => void }) => {
  const mailbox = useActionMailbox(action, undefined)
  return (
    <Dialog
      title={`${label}?`}
      description={action.confirm}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>{text('cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} disabled={mailbox.blocked} onClick={onConfirm}>
            {label}
          </Button>
        </>
      }
    >
      {mailbox.notice}
    </Dialog>
  )
}
