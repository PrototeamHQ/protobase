import { useId, useState } from 'react'
import { AuthError } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { Button } from '../primitives/button'
import { Dialog } from '../primitives/dialog'
import { Input } from '../primitives/input'
import { SectionError } from './account-section'
import { text } from './messages'

export type DeleteAccountDialogProps = {
  /** The account has a password: ask for it. Without one, a session that signed in within the last day confirms it. */
  hasPassword: boolean
  /** Rejects with `AuthError`, which the dialog shows; resolves once the account is gone. */
  onDelete: (password?: string) => Promise<void>
  onClose: () => void
}

// The server's refusals of this deletion, in words for the person at the keyboard.
const deletionMessage = (error: AuthError) => {
  if (error.code === 'LAST_ADMIN') return text('deleteAccountLastAdmin')
  if (error.code === 'ACCOUNT_LOCKED') return text('deleteAccountLocked')
  return authMessage(error)
}

/** Asks the person to confirm deleting their own account, with their password when it has one. */
export const DeleteAccountDialog = ({ hasPassword, onDelete, onClose }: DeleteAccountDialogProps) => {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const formId = useId()

  const confirm = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await onDelete(hasPassword ? password : undefined)
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      setError(deletionMessage(failure))
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={text('deleteAccountQuestion')}
      description={text('deleteAccountWarning')}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>{text('cancel')}</Button>
          <Button variant="danger" type="submit" form={formId} loading={busy} disabled={hasPassword && !password}>
            {text('deleteAccountConfirm')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void confirm()
        }}
      >
        {hasPassword && (
          <label className="flex flex-col gap-1.5 font-medium">
            {text('deleteAccountPassword')}
            <Input type="password" name="current-password" autoComplete="current-password" autoFocus value={password} invalid={Boolean(error)} onChange={(event) => setPassword(event.target.value)} />
          </label>
        )}
        <SectionError message={error} />
      </form>
    </Dialog>
  )
}
