import { emailCodeMinutes } from '@protobase/schema/internal'
import { CodeForm } from './code-form'
import { text } from './messages'

export type SignUpCodeFormProps = {
  /** The address the code went to. */
  email: string
  /** Called with the code; the page shows `error` when it is not right. */
  onSubmit: (code: string) => void
  /** Sends a new code to the same address. */
  onResend: () => void
  /** Back to the first step, for another address. */
  onBack: () => void
  busy?: boolean
  error?: string
  /** Shown once a new code is on its way. */
  notice?: string
  /** Seconds before "Send a new code" works; 30 by default. */
  resendCooldown?: number
}

/** The second step of making an account: the emailed code on its own, before the name and password. */
export const SignUpCodeForm = ({ email, onBack, ...rest }: SignUpCodeFormProps) => (
  <CodeForm
    title={text('checkEmail')}
    description={text('signUpCodeDescription')}
    explanation={
      <>
        {text.rich('signUpCodeSent', { email: <span className="font-medium text-foreground">{email}</span>, minutes: emailCodeMinutes })}
      </>
    }
    submitLabel={text('continue')}
    onChangeAddress={onBack}
    changeAddressLabel={text('useAnotherAddress')}
    {...rest}
  />
)
