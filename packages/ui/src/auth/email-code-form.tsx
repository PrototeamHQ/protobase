import { CodeForm } from './code-form'
import { slotted } from '../locale/slotted'
import { text } from './messages'

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
    title={text('checkEmail')}
    description={text('signInCodeDescription')}
    explanation={
      <>
        {slotted(text('signInCodeSent'), <span className="font-medium text-foreground">{email}</span>)}
      </>
    }
    submitLabel={text('signIn')}
    onChangeAddress={onBack}
    changeAddressLabel={text('backToSignIn')}
    {...rest}
  />
)
