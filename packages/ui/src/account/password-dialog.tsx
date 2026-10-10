import { useState } from 'react'
import { AuthError } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { Button } from '../primitives/button'
import { Dialog } from '../primitives/dialog'
import { Input } from '../primitives/input'

export type PasswordDialogProps = {
  title: string
  description: string
  /** The button that runs `onConfirm`, for example "Turn off". */
  confirmLabel: string
  danger?: boolean
  /** Ask for the password, which the change needs when the account has one. */
  needsPassword: boolean
  /** Rejects with `AuthError`, which the dialog shows; resolves when the change is done. */
  onConfirm: (password?: string) => Promise<void>
  onClose: () => void
}

/** Confirms a change to the account's sign-in, with the password when it has one. */
export const PasswordDialog = ({ title, description, confirmLabel, danger, needsPassword, onConfirm, onClose }: PasswordDialogProps) => {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const confirm = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await onConfirm(needsPassword ? password : undefined)
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      setError(authMessage(failure))
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={title}
      description={description}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={busy} disabled={needsPassword && !password} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {needsPassword && (
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">
          Your password
          <Input type="password" autoComplete="current-password" autoFocus value={password} invalid={Boolean(error)} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && password && void confirm()} />
        </label>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-danger-text">
          {error}
        </p>
      )}
    </Dialog>
  )
}
