import { useState } from 'react'
import { AuthError } from '@protobase/client'
import { useAuth } from './auth-provider'
import { ForgotPasswordForm } from './forgot-password-form'
import { resetLinkTarget } from './reset-link'

/** Asks the server to email a reset link that leads back to this page. */
export const ForgotPasswordPage = ({ onBack }: { onBack: () => void }) => {
  const { session } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [sentTo, setSentTo] = useState<string>()

  const submit = async (email: string) => {
    setBusy(true)
    setError(undefined)
    try {
      await session.requestPasswordReset(email, resetLinkTarget(window.location.href))
      setSentTo(email)
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      setError(failure.status === 429 ? 'Too many requests. Wait a minute and try again.' : failure.message)
    }
    setBusy(false)
  }

  return <ForgotPasswordForm busy={busy} error={error} sentTo={sentTo} onBack={onBack} onSubmit={(email) => void submit(email)} />
}
