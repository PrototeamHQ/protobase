import { useState } from 'react'
import { Button } from '../primitives/button'
import { AuthLayout } from './auth-layout'
import { CodeInput } from './code-input'

export type EmailCodeFormProps = {
  /** The address the code went to. */
  email: string
  /** Called with the code; the page shows `error` when it fails. */
  onSubmit: (code: string) => void
  /** Sends a new code to the same address. */
  onResend: () => void
  onBack: () => void
  busy?: boolean
  error?: string
  /** Shown once a new code is on its way. */
  notice?: string
}

/** The second half of signing in with an emailed code: the code from the email. */
export const EmailCodeForm = ({ email, onSubmit, onResend, onBack, busy, error, notice }: EmailCodeFormProps) => {
  const [code, setCode] = useState('')
  return (
    <AuthLayout title="Check your email" description="Enter the code we sent to sign in.">
      <p className="mb-4 text-[13px] text-muted-foreground">
        If <span className="font-medium text-foreground">{email}</span> has an account, a 6-digit code is on its way. It works for 5 minutes, once.
      </p>
      {notice && (
        <p role="status" className="mb-4 rounded-md bg-success-soft px-3 py-2 text-xs font-medium text-success-text">
          {notice}
        </p>
      )}
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(code.trim())
        }}
      >
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">
          Code
          <CodeInput name="code" required autoFocus value={code} invalid={Boolean(error)} onChange={(event) => setCode(event.target.value)} />
        </label>
        {error && (
          <p role="alert" className="text-xs font-medium text-danger-text">
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" loading={busy} className="min-h-10">
          Sign in
        </Button>
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={onBack} className="min-h-10">
            Back to sign in
          </Button>
          <Button variant="ghost" onClick={onResend} disabled={busy} className="min-h-10">
            Send a new code
          </Button>
        </div>
      </form>
    </AuthLayout>
  )
}
