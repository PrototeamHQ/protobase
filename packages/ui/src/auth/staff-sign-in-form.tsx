import { useState } from 'react'
import { cn } from '../lib/cn'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { AuthLayout } from './auth-layout'

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
      <AuthLayout title="Staff sign-in" description="Staff of the team that runs this app cannot sign in as people here.">
        {error && (
          <p role="alert" className="mb-4 text-xs font-medium text-danger-text">
            {error}
          </p>
        )}
        <Button variant="primary" className="min-h-10 w-full" onClick={onBack}>
          Back to sign in
        </Button>
      </AuthLayout>
    )
  }
  return (
    <AuthLayout title="Sign in as a person" description={`For staff of ${operator}, to help someone with this app.`}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(email.trim(), reason.trim())
        }}
      >
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">
          Their email
          <Input type="email" name="email" required autoFocus={!givenEmail} value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-6" />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">
          Reason
          <textarea
            name="reason"
            required
            minLength={minimumReason}
            rows={3}
            value={reason}
            placeholder="Ticket 4211: the invoice totals look wrong"
            onChange={(event) => setReason(event.target.value)}
            className={cn(
              'resize-y rounded-md border bg-background px-2.5 py-1.5 text-[13px] font-normal shadow-sm outline-none placeholder:text-faint-foreground focus:border-primary focus:ring-2 focus:ring-primary/20',
              error ? 'border-danger' : 'border-border-strong',
            )}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          You sign in at {operator} with a passkey or a second step. The session is short, shows a banner, and cannot change their sign-in. The app's admins see who signed in as whom, and why.
        </p>
        {error && (
          <p role="alert" className="text-xs font-medium text-danger-text">
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" loading={busy} className="min-h-10">
          Continue with {operator}
        </Button>
        <Button variant="ghost" onClick={onBack} className="min-h-10">
          Back to sign in
        </Button>
      </form>
    </AuthLayout>
  )
}
