import { useState } from 'react'
import { cn } from '../lib/cn'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { AuthLayout } from './auth-layout'
import { text } from './messages'

export type StaffSignInFormProps = {
  /** The operator provider's name; `undefined` when this app does not let staff sign in. */
  operator?: string
  /** Filled in from the link that opened the page. */
  email?: string
  reason?: string
  /** Called with the person's address and the reason; the page goes on to the operator provider. */
  onSubmit: (email: string, reason: string) => void
  onBack: () => void
  busy?: boolean
  error?: string
}

const minimumReason = 10

/** For staff of the operator: sign in as a person of this app, with a reason the app's admins see in their log. */
export const StaffSignInForm = ({ operator, email: givenEmail = '', reason: givenReason = '', onSubmit, onBack, busy, error }: StaffSignInFormProps) => {
  const [email, setEmail] = useState(givenEmail)
  const [reason, setReason] = useState(givenReason)
  if (!operator) {
    return (
      <AuthLayout title={text('staffTitle')} description={text('staffUnavailable')}>
        {error && (
          <p role="alert" className="mb-4 text-xs font-medium text-danger-text">
            {error}
          </p>
        )}
        <Button variant="primary" className="min-h-10 w-full" onClick={onBack}>
          {text('backToSignIn')}
        </Button>
      </AuthLayout>
    )
  }
  return (
    <AuthLayout title={text('signInAsPerson')} description={text('forStaffOf', operator)}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(email.trim(), reason.trim())
        }}
      >
        <label className="flex flex-col gap-1.5 font-medium">
          {text('theirEmail')}
          <Input type="email" name="email" required autoFocus={!givenEmail} value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-6" />
        </label>
        <label className="flex flex-col gap-1.5 font-medium">
          {text('reason')}
          <textarea
            name="reason"
            required
            minLength={minimumReason}
            rows={3}
            value={reason}
            placeholder={text('reasonExample')}
            onChange={(event) => setReason(event.target.value)}
            className={cn(
              'resize-y rounded-md border bg-background px-2.5 py-1.5 font-normal shadow-sm outline-none placeholder:text-faint-foreground focus:border-primary focus:ring-2 focus:ring-primary/20',
              error ? 'border-danger' : 'border-border-strong',
            )}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          {text('staffExplanation', operator)}
        </p>
        {error && (
          <p role="alert" className="text-xs font-medium text-danger-text">
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" loading={busy} className="min-h-10">
          {text('continueWith', operator)}
        </Button>
        <Button variant="ghost" onClick={onBack} className="min-h-10">
          {text('backToSignIn')}
        </Button>
      </form>
    </AuthLayout>
  )
}
