import type { ActionModel } from '@protobase/schema'
import { ActionInputsDialog } from './action-inputs/action-inputs-dialog'
import { ConfirmAction } from './confirm-action'

/** Whether the action is drawn in red, as one that destroys or interrupts something: a delete, or one with `variant: 'danger'`. */
export const isDanger = (action: ActionModel) => action.variant === 'danger' || action.run?.kind === 'delete'

/** Whether pressing the action's button opens a dialog first: to ask its question, or for its inputs. */
export const asksFirst = (action: ActionModel) => Boolean(action.confirm || action.inputs?.length)

type ActionPromptProps = {
  action: ActionModel
  label: string
  danger?: boolean
  onCancel: () => void
  /** Runs an action without inputs once its question is answered. */
  onConfirm: () => void
  /** Runs it with the answers to its inputs, throwing its failure for the dialog to show. */
  onSubmit: (values: Record<string, unknown>) => Promise<void>
}

/** The dialog an action that asks first opens: its inputs, or else its question. */
export const ActionPrompt = ({ action, label, danger, onCancel, onConfirm, onSubmit }: ActionPromptProps) => {
  const { inputs } = action
  if (inputs?.length) return <ActionInputsDialog action={{ ...action, inputs }} label={label} danger={danger} onCancel={onCancel} onSubmit={onSubmit} />
  return <ConfirmAction action={action} label={label} danger={danger} onCancel={onCancel} onConfirm={onConfirm} />
}
