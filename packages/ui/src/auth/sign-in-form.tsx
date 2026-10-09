import { useState } from 'react'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { AuthLayout } from './auth-layout'

export type SignInFormProps = {
  /** Called with the email and password; the page shows `error` when it fails. */
  onSubmit: (email: string, password: string) => void
  busy?: boolean
  error?: string
  workspace?: string
  /** Shown above the form, for example after a password reset. */
  notice?: string
  /** Opens the page that emails a reset link; without it there is no "Forgot password?" link. */
  onForgotPassword?: () => void
}

export const SignInForm = ({ onSubmit, busy, error, workspace, notice, onForgotPassword }: SignInFormProps) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  return (
    <AuthLayout title="Sign in to Protobase" description={workspace}>
      {notice && (
        <p role="status" className="mb-4 rounded-md bg-success-soft px-3 py-2 text-xs font-medium text-success-text">
          {notice}
        </p>
      )}
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(email.trim(), password)
        }}
      >
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">
          Email
          <Input type="email" name="email" autoComplete="username" required autoFocus value={email} invalid={Boolean(error)} onChange={(event) => setEmail(event.target.value)} className="min-h-6" />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">
          Password
          <Input type="password" name="password" autoComplete="current-password" required value={password} invalid={Boolean(error)} onChange={(event) => setPassword(event.target.value)} className="min-h-6" />
        </label>
        {error && (
          <p role="alert" className="text-xs font-medium text-danger-text">
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" loading={busy} className="min-h-10">
          Sign in
        </Button>
        {onForgotPassword && (
          <button type="button" onClick={onForgotPassword} className="self-center text-[13px] font-medium text-primary-text hover:underline">
            Forgot password?
          </button>
        )}
      </form>
    </AuthLayout>
  )
}
