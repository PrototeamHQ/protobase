import { useId, useState } from 'react'
import { AuthError } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { minPasswordLength } from '../auth/reset-password-form'
import { Button } from '../primitives/button'
import { Checkbox } from '../primitives/checkbox'
import { Dialog } from '../primitives/dialog'
import { Input } from '../primitives/input'
import { SectionError } from './account-section'
import { text } from './messages'

export type PasswordChangeDialogProps = {
  /** The account has a password: ask for it, and offer to sign out the other devices. Without one, it sets the first. */
  hasPassword: boolean
  /** Rejects with `AuthError`, which the dialog shows; resolves when the password is saved. */
  onSave: (input: { current: string; next: string; signOutOthers: boolean }) => Promise<void>
  onClose: () => void
}

// Better Auth's answers to a new password or a wrong current one, in words for the person at the keyboard.
const passwordMessage = (error: AuthError) => {
  if (error.code === 'PASSWORD_TOO_SHORT') return text('useAtLeast', { length: minPasswordLength })
  if (error.code === 'PASSWORD_TOO_LONG') return text('passwordTooLong')
  return authMessage(error)
}

// Why the new password cannot be sent yet, before the server is asked.
const draftProblem = (next: string, repeat: string) => {
  if (next.length < minPasswordLength) return text('useAtLeast', { length: minPasswordLength })
  if (next !== repeat) return text('passwordsDiffer')
  return undefined
}

/** Changes the account's password with the current one, or sets a first one for an account without. */
export const PasswordChangeDialog = ({ hasPassword, onSave, onClose }: PasswordChangeDialogProps) => {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [signOutOthers, setSignOutOthers] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const formId = useId()
  const filled = (!hasPassword || current) && next && repeat

  const save = async () => {
    const problem = draftProblem(next, repeat)
    setError(problem)
    if (problem) return
    setBusy(true)
    try {
      await onSave({ current, next, signOutOthers })
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      setError(passwordMessage(failure))
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={hasPassword ? text('changePassword') : text('setPassword')}
      description={text('atLeast', { length: minPasswordLength })}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>{text('cancel')}</Button>
          <Button variant="primary" type="submit" form={formId} loading={busy} disabled={!filled}>
            {text('save')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        {hasPassword && (
          <label className="flex flex-col gap-1.5 font-medium">
            {text('currentPassword')}
            <Input type="password" name="current-password" autoComplete="current-password" autoFocus value={current} onChange={(event) => setCurrent(event.target.value)} />
          </label>
        )}
        <label className="flex flex-col gap-1.5 font-medium">
          {text('newPassword')}
          <Input type="password" name="new-password" autoComplete="new-password" autoFocus={!hasPassword} value={next} invalid={Boolean(error)} onChange={(event) => setNext(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 font-medium">
          {text('repeatPassword')}
          <Input type="password" name="repeat-password" autoComplete="new-password" value={repeat} invalid={Boolean(error)} onChange={(event) => setRepeat(event.target.value)} />
        </label>
        {hasPassword && (
          <label className="flex items-center gap-2 text-muted-foreground">
            <Checkbox checked={signOutOthers} onChange={setSignOutOthers} label={text('signOutOthers')} />
            {text('signOutOthers')}
          </label>
        )}
        <SectionError message={error} />
      </form>
    </Dialog>
  )
}
