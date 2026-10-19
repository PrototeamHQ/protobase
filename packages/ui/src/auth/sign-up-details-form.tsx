import { useId, useState } from 'react'
import type { SignInMethod } from '@protobase/client'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { AuthLayout } from './auth-layout'
import { minPasswordLength } from './reset-password-form'
import { slotted } from '../locale/slotted'
import { text } from './messages'

export type SignUpDetails = { name: string; password?: string }

export type SignUpDetailsFormProps = {
  /** The address the code proved is theirs. */
  email: string
  /** Called with the name and the password, if any; the page shows `error` when it fails. */
  onSubmit: (details: SignUpDetails) => void
  /** Back to the first step, for another address. */
  onBack: () => void
  /** The ways to sign in the server offers: a password is asked for with `password`, and optional with `emailCode`. */
  methods: SignInMethod[]
  busy?: boolean
  error?: string
}

/** The last step of making an account, once the emailed code was right: the person's name and how they will sign in. */
export const SignUpDetailsForm = ({ email, onSubmit, onBack, methods, busy, error }: SignUpDetailsFormProps) => {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const passwordHint = useId()
  const withPassword = methods.includes('password')
  const passwordOptional = methods.includes('emailCode')
  return (
    <AuthLayout title={text('detailsTitle')} description={text('detailsDescription')}>
      <p className="mb-4 text-muted-foreground">
        {slotted(text('codeWasRight'), <span className="font-medium text-foreground">{email}</span>)}
      </p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit({ name: name.trim(), ...(withPassword && password && { password }) })
        }}
      >
        <label className="flex flex-col gap-1.5 font-medium">
          {text('yourName')}
          <Input name="name" autoComplete="name" required autoFocus maxLength={200} value={name} onChange={(event) => setName(event.target.value)} className="min-h-6" />
        </label>
        {withPassword && (
          <div className="flex flex-col gap-1.5">
            <label className="flex flex-col gap-1.5 font-medium">
              {passwordOptional ? text('passwordOptional') : text('password')}
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
              {text('atLeast', minPasswordLength)}
              {passwordOptional && text('withoutPassword')}
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-body font-medium text-danger-text">
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" loading={busy} className="min-h-10">
          {text('createAccount')}
        </Button>
        <Button variant="ghost" onClick={onBack} className="min-h-10">
          {text('useAnotherAddress')}
        </Button>
      </form>
    </AuthLayout>
  )
}
