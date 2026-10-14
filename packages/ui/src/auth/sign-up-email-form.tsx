import { Mail } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { AuthLayout } from './auth-layout'

export type SignUpEmailFormProps = {
  /** Called with the address to email a code to; the page shows `error` when it fails. */
  onSubmit: (email: string) => void
  /** Back to the sign-in page, for someone with an account. */
  onSignIn: () => void
  /** Goes back to browsing without an account; without it there is no such link. */
  onBrowse?: () => void
  busy?: boolean
  error?: string
  workspace?: string
}

/** The first step of making an account: the address, which gets a code to prove it is theirs. */
export const SignUpEmailForm = ({ onSubmit, onSignIn, onBrowse, busy, error, workspace }: SignUpEmailFormProps) => {
  const [email, setEmail] = useState('')
  return (
    <AuthLayout title="Create an account" description={workspace}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(email.trim())
        }}
      >
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">
          Email
          <Input type="email" name="email" autoComplete="email" required autoFocus value={email} invalid={Boolean(error)} onChange={(event) => setEmail(event.target.value)} className="min-h-6" />
        </label>
        <p className="text-[13px] text-muted-foreground">We email you a code to make sure the address is yours.</p>
        {error && (
          <p role="alert" className="text-xs font-medium text-danger-text">
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" loading={busy} className="min-h-10">
          <Mail className="size-4" />
          Email me a code
        </Button>
        <p className="text-center text-[13px] text-muted-foreground">
          Have an account?{' '}
          <button type="button" onClick={onSignIn} className="font-medium text-primary-text hover:underline">
            Sign in
          </button>
        </p>
      </form>
      {onBrowse && (
        <button type="button" onClick={onBrowse} className="mt-4 w-full text-center text-[13px] font-medium text-muted-foreground hover:text-foreground hover:underline">
          Continue without an account
        </button>
      )}
    </AuthLayout>
  )
}
