import { useState } from 'react'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { AuthLayout } from './auth-layout'

export type ForgotPasswordFormProps = {
  /** Called with the email; the page shows `error` when the request fails. */
  onSubmit: (email: string) => void
  onBack: () => void
  busy?: boolean
  error?: string
  /** The address a link was asked for: the page then says to check the inbox. */
  sentTo?: string
}

export const ForgotPasswordForm = ({ onSubmit, onBack, busy, error, sentTo }: ForgotPasswordFormProps) => {
  const [email, setEmail] = useState('')
  if (sentTo) {
    return (
      <AuthLayout title="Check your email">
        <p className="text-[13px] text-muted-foreground">
          If <span className="font-medium text-foreground">{sentTo}</span> has an account, an email with a link to choose a new password is on its way. The link works once, for a limited time.
        </p>
        <Button variant="primary" className="mt-4 min-h-10 w-full" onClick={onBack}>
          Back to sign in
        </Button>
      </AuthLayout>
    )
  }
  return (
    <AuthLayout title="Reset your password" description="We email you a link to choose a new one.">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(email.trim())
        }}
      >
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">
          Email
          <Input type="email" name="email" autoComplete="username" required autoFocus value={email} invalid={Boolean(error)} onChange={(event) => setEmail(event.target.value)} className="min-h-6" />
        </label>
        {error && (
          <p role="alert" className="text-xs font-medium text-danger-text">
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" loading={busy} className="min-h-10">
          Send reset link
        </Button>
        <Button variant="ghost" onClick={onBack} className="min-h-10">
          Back to sign in
        </Button>
      </form>
    </AuthLayout>
  )
}
