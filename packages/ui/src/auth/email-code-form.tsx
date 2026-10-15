import { CodeForm } from './code-form'

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
  /** Seconds before "Send a new code" works; 30 by default. */
  resendCooldown?: number
}

/** The second half of signing in with an emailed code: the code from the email. */
export const EmailCodeForm = ({ email, onBack, ...rest }: EmailCodeFormProps) => (
  <CodeForm
    title="Check your email"
    description="Enter the code we sent to sign in."
    explanation={
      <>
        If <span className="font-medium text-foreground">{email}</span> has an account, a 6-digit code is on its way. It works for 5 minutes, once.
      </>
    }
    submitLabel="Sign in"
    onChangeAddress={onBack}
    changeAddressLabel="Back to sign in"
    {...rest}
  />
)
