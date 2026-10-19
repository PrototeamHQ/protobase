import { useState } from 'react'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { AuthLayout } from './auth-layout'
import { text } from './messages'

/** The server's rule for every password (`createAuth`). */
export const minPasswordLength = 12

export type ResetPasswordFormProps = {
  /** Called with the new password once both fields match; the page shows `error` when it fails. */
  onSubmit: (password: string) => void
  /** The link was used or has expired: offer a new one instead of the form. */
  invalidLink?: boolean
  /** Asks for a new link; without it, a dead link only leads back to sign-in. */
  onRequestNewLink?: () => void
  onBack: () => void
  busy?: boolean
  error?: string
}

export const ResetPasswordForm = ({ onSubmit, invalidLink, onRequestNewLink, onBack, busy, error }: ResetPasswordFormProps) => {
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [mismatch, setMismatch] = useState(false)
  if (invalidLink) {
    return (
      <AuthLayout title={text('linkExpiredTitle')}>
        <p className="text-muted-foreground">{text('linkExpiredExplanation')}</p>
        <div className="mt-4 flex flex-col gap-2">
          {onRequestNewLink && (
            <Button variant="primary" className="min-h-10" onClick={onRequestNewLink}>
              {text('sendNewLink')}
            </Button>
          )}
          <Button variant={onRequestNewLink ? 'ghost' : 'primary'} className="min-h-10" onClick={onBack}>
            {text('backToSignIn')}
          </Button>
        </div>
      </AuthLayout>
    )
  }
  const shown = mismatch ? text('passwordsDiffer') : error
  return (
    <AuthLayout title={text('choosePassword')} description={text('atLeast', minPasswordLength)}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          setMismatch(password !== repeat)
          if (password === repeat) onSubmit(password)
        }}
      >
        <label className="flex flex-col gap-1.5 font-medium">
          {text('newPassword')}
          <Input type="password" name="new-password" autoComplete="new-password" required minLength={minPasswordLength} autoFocus value={password} invalid={Boolean(shown)} onChange={(event) => setPassword(event.target.value)} className="min-h-6" />
        </label>
        <label className="flex flex-col gap-1.5 font-medium">
          {text('repeatPassword')}
          <Input type="password" name="repeat-password" autoComplete="new-password" required minLength={minPasswordLength} value={repeat} invalid={Boolean(shown)} onChange={(event) => setRepeat(event.target.value)} className="min-h-6" />
        </label>
        {shown && (
          <p role="alert" className="text-body font-medium text-danger-text">
            {shown}
          </p>
        )}
        <Button variant="primary" type="submit" loading={busy} className="min-h-10">
          {text('setPassword')}
        </Button>
      </form>
    </AuthLayout>
  )
}
