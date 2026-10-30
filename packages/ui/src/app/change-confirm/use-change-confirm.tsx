import { useState } from 'react'
import type { FieldModel, FieldViewModel } from '@protobase/schema'
import { Button } from '../../primitives/button'
import { Dialog } from '../../primitives/dialog'
import { humanize } from '../../live/naming'
import { asksToConfirm } from './asks-to-confirm'
import { text } from './messages'

/**
 * Whether `node` sits in the question a change asks. The dialog is portalled to the body, so a list cell does not clip
 * it, while its events still bubble through the editor that asked it.
 */
export const inChangeConfirm = (node: EventTarget | null) => node instanceof Element && node.closest('[data-dialog="change-confirm"]') !== null

type ChangeConfirmParams = {
  field: FieldModel
  hints?: FieldViewModel
  value: unknown
  stored: unknown
  onChange: (value: unknown) => void
}

/**
 * The field's `onChange`, asking the view's `.confirm()` question before it hands on a change that `asksToConfirm`
 * picks out, and the dialog that asks it. Cancelling drops the change, so the field keeps its value.
 */
export const useChangeConfirm = ({ field, hints, value, stored, onChange }: ChangeConfirmParams) => {
  const [pending, setPending] = useState<{ next: unknown }>()

  const change = (next: unknown) => {
    if (asksToConfirm(field, hints, value, stored, next)) setPending({ next })
    else onChange(next)
  }

  const cancel = () => setPending(undefined)
  const confirm = () => {
    setPending(undefined)
    onChange(pending!.next)
  }

  const dialog =
    pending && (
      <Dialog
        name="change-confirm"
        title={text('title', hints?.label ?? humanize(field.name))}
        description={hints?.confirm}
        onClose={cancel}
        actions={
          <>
            <Button onClick={cancel}>{text('cancel')}</Button>
            <Button variant="primary" onClick={confirm}>
              {text('change')}
            </Button>
          </>
        }
      />
    )

  return { onChange: change, dialog }
}
