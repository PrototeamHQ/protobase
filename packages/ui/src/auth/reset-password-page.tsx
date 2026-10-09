import { useState } from 'react'
import { AuthError } from '@protobase/client'
import { useAuth } from './auth-provider'
import { minPasswordLength, ResetPasswordForm } from './reset-password-form'

/** Better Auth's answers to a new password, in words for the person at the keyboard. */
export const resetPasswordMessage = (error: AuthError) => {
  if (error.status === 429) return 'Too many attempts. Wait a minute and try again.'
  if (error.code === 'PASSWORD_TOO_SHORT') return `Use at least ${minPasswordLength} characters.`
  if (error.code === 'PASSWORD_TOO_LONG') return 'That password is too long.'
  return error.message
}

export type ResetPasswordPageProps = {
  /** From the emailed link; `undefined` when the link was used or has expired. */
  token: string | undefined
  /** The new password is set. */
  onDone: () => void
  onRequestNewLink?: () => void
  onBack: () => void
}

/** Sets a new password with the token of an emailed reset link. */
export const ResetPasswordPage = ({ token, onDone, onRequestNewLink, onBack }: ResetPasswordPageProps) => {
  const { session } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [invalid, setInvalid] = useState(!token)

  const submit = async (password: string) => {
    setBusy(true)
    setError(undefined)
    try {
      await session.resetPassword(token!, password)
      onDone()
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      if (failure.code === 'INVALID_TOKEN') setInvalid(true)
      else setError(resetPasswordMessage(failure))
      setBusy(false)
    }
  }

  return <ResetPasswordForm busy={busy} error={error} invalidLink={invalid} onRequestNewLink={onRequestNewLink} onBack={onBack} onSubmit={(password) => void submit(password)} />
}
