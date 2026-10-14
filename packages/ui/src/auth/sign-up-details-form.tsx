import { useId, useState } from 'react'
import type { SignInMethod } from '@protobase/client'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { AuthLayout } from './auth-layout'
import { CodeInput } from './code-input'
import { minPasswordLength } from './reset-password-form'

export type SignUpDetails = { code: string; name: string; password?: string }

export type SignUpDetailsFormProps = {
  /** The address the code went to. */
  email: string
  /** Called with the code, the name and the password, if any; the page shows `error` when it fails. */
  onSubmit: (details: SignUpDetails) => void
  /** Sends a new code to the same address. */
  onResend: () => void
  /** Back to the first step, for another address. */
  onBack: () => void
  /** The ways to sign in the server offers: a password is asked for with `password`, and optional with `emailCode`. */
  methods: SignInMethod[]
  busy?: boolean
  error?: string
  /** Shown once a new code is on its way. */
  notice?: string
}

/** The second step of making an account: the emailed code, the person's name and how they will sign in. */
export const SignUpDetailsForm = ({ email, onSubmit, onResend, onBack, methods, busy, error, notice }: SignUpDetailsFormProps) => {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const passwordHint = useId()
  const withPassword = methods.includes('password')
  const passwordOptional = methods.includes('emailCode')
  return (
    <AuthLayout title="Check your email" description="Enter the code we sent to create your account.">
      <p className="mb-4 text-[13px] text-muted-foreground">
        A 6-digit code is on its way to <span className="font-medium text-foreground">{email}</span>. It works for 5 minutes, once. If the address has an account already, the email says so instead.
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
          onSubmit({ code: code.trim(), name: name.trim(), ...(withPassword && password && { password }) })
        }}
      >
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">
          Code
          <CodeInput name="code" required autoFocus value={code} invalid={Boolean(error)} onChange={(event) => setCode(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">
          Your name
          <Input name="name" autoComplete="name" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} className="min-h-6" />
        </label>
        {withPassword && (
          <div className="flex flex-col gap-1.5">
            <label className="flex flex-col gap-1.5 text-[13px] font-medium">
              {passwordOptional ? 'Password (optional)' : 'Password'}
              <Input
                type="password"
                name="password"
                autoComplete="new-password"
                aria-describedby={passwordHint}
                required={!passwordOptional}
                minLength={minPasswordLength}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-h-6"
              />
            </label>
            <p id={passwordHint} className="text-xs text-muted-foreground">
              At least {minPasswordLength} characters.{passwordOptional && ' Without one, you sign in with a code we email you.'}
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs font-medium text-danger-text">
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" loading={busy} className="min-h-10">
          Create account
        </Button>
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={onBack} className="min-h-10">
            Use another address
          </Button>
          <Button variant="ghost" onClick={onResend} disabled={busy} className="min-h-10">
            Send a new code
          </Button>
        </div>
      </form>
    </AuthLayout>
  )
}
