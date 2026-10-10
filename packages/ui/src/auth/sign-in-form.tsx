import { KeyRound, Mail } from 'lucide-react'
import { useRef, useState } from 'react'
import type { SignInMethod } from '@protobase/client'
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
  /** The ways to sign in the server offers; default a password only. */
  methods?: SignInMethod[]
  /** Emails a sign-in code to the address; offered when `methods` has `emailCode`. */
  onSendCode?: (email: string) => void
  /** Signs in with a passkey; offered when `methods` has `passkey`. */
  onPasskey?: () => void
  /** Opens the page that emails a reset link; without it there is no "Forgot password?" link. */
  onForgotPassword?: () => void
  /** The sign-in providers, each offered as "Continue with {name}". */
  providers?: Array<{ id: string; name: string }>
  /** Starts sign-in with one of `providers`. */
  onContinueWith?: (provider: string) => void
}

const Divider = () => (
  <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
    <span className="h-px flex-1 bg-border" />
    or
    <span className="h-px flex-1 bg-border" />
  </div>
)

export const SignInForm = ({ onSubmit, busy, error, workspace, notice, methods = ['password'], onSendCode, onPasskey, onForgotPassword, providers = [], onContinueWith }: SignInFormProps) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const emailInput = useRef<HTMLInputElement>(null)
  const withPassword = methods.includes('password')
  const withCode = methods.includes('emailCode') && onSendCode !== undefined
  const withPasskey = methods.includes('passkey') && onPasskey !== undefined
  const offered = onContinueWith ? providers : []

  // The code button sits in the password form, which also wants a password; it asks only for the address.
  const sendCode = () => {
    if (!emailInput.current?.reportValidity()) return
    onSendCode?.(email.trim())
  }

  return (
    <AuthLayout title="Sign in to Protobase" description={workspace}>
      {notice && (
        <p role="status" className="mb-4 rounded-md bg-success-soft px-3 py-2 text-xs font-medium text-success-text">
          {notice}
        </p>
      )}
      {(offered.length > 0 || withPasskey) && (
        <>
          <div className="flex flex-col gap-2">
            {offered.map((provider) => (
              <Button key={provider.id} onClick={() => onContinueWith?.(provider.id)} disabled={busy} className="min-h-10 w-full">
                Continue with {provider.name}
              </Button>
            ))}
            {withPasskey && (
              <Button onClick={onPasskey} disabled={busy} className="min-h-10 w-full">
                <KeyRound className="size-4" />
                Sign in with a passkey
              </Button>
            )}
          </div>
          {withPassword || withCode ? (
            <Divider />
          ) : (
            error && (
              <p role="alert" className="mt-4 text-xs font-medium text-danger-text">
                {error}
              </p>
            )
          )}
        </>
      )}
      {(withPassword || withCode) && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (withPassword) onSubmit(email.trim(), password)
            else sendCode()
          }}
        >
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">
            Email
            <Input ref={emailInput} type="email" name="email" autoComplete="username webauthn" required autoFocus value={email} invalid={Boolean(error)} onChange={(event) => setEmail(event.target.value)} className="min-h-6" />
          </label>
          {withPassword && (
            <label className="flex flex-col gap-1.5 text-[13px] font-medium">
              Password
              <Input type="password" name="password" autoComplete="current-password" required value={password} invalid={Boolean(error)} onChange={(event) => setPassword(event.target.value)} className="min-h-6" />
            </label>
          )}
          {error && (
            <p role="alert" className="text-xs font-medium text-danger-text">
              {error}
            </p>
          )}
          {withPassword && (
            <Button variant="primary" type="submit" loading={busy} className="min-h-10">
              Sign in
            </Button>
          )}
          {withCode && (
            <Button variant={withPassword ? 'secondary' : 'primary'} type={withPassword ? 'button' : 'submit'} onClick={withPassword ? sendCode : undefined} loading={busy && !withPassword} disabled={busy} className="min-h-10">
              <Mail className="size-4" />
              Email me a sign-in code
            </Button>
          )}
          {withPassword && onForgotPassword && (
            <button type="button" onClick={onForgotPassword} className="self-center text-[13px] font-medium text-primary-text hover:underline">
              Forgot password?
            </button>
          )}
        </form>
      )}
    </AuthLayout>
  )
}
