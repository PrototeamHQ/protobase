import type { ActionModel } from '@protobase/schema'
import { Button } from '../../primitives/button'
import { Dialog } from '../../primitives/dialog'

/** The question an action with `confirm` asks before it runs. */
export const ConfirmAction = ({ action, label, danger, onCancel, onConfirm }: { action: ActionModel; label: string; danger?: boolean; onCancel: () => void; onConfirm: () => void }) => (
  <Dialog
    title={`${label}?`}
    description={action.confirm}
    onClose={onCancel}
    actions={
      <>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {label}
        </Button>
      </>
    }
  />
)
