import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '../primitives/button'
import { OtpInput } from '../primitives/otp-input'
import { AuthLayout } from './auth-layout'
import { ResendCodeButton } from './resend-code-button'
import { text } from './messages'

export type CodeFormProps = {
  title: string
  description?: string
  /** Above the code: which address it went to, and how long it works. */
  explanation: ReactNode
  /** The button that checks the code, which a complete code presses by itself. */
  submitLabel: string
  /** Called with the code; the page shows `error` when it is not right. */
  onSubmit: (code: string) => void
  /** Sends a new code to the same address. */
  onResend: () => void
  /** Back to the step that asked for the address, for another one. */
  onChangeAddress: () => void
  changeAddressLabel: string
  busy?: boolean
  error?: string
  /** Shown once a new code is on its way. */
  notice?: string
  /** Seconds before "Send a new code" works, after each code; 30 by default. */
  resendCooldown?: number
}

/**
 * A step that checks an emailed code on its own: where it went, a box per digit, a new code after a wait, and a way back
 * to another address. Nothing else is asked for until the code is right.
 */
export const CodeForm = ({ title, description, explanation, submitLabel, onSubmit, onResend, onChangeAddress, changeAddressLabel, busy, error, notice, resendCooldown }: CodeFormProps) => {
  const [code, setCode] = useState('')
  const field = useRef<HTMLInputElement>(null)

  // A new code is on its way: the old one is of no use, so its boxes empty and wait for the new one.
  useEffect(() => {
    if (!notice) return
    setCode('')
    field.current?.focus()
  }, [notice])

  return (
    <AuthLayout title={title} description={description}>
      <p className="mb-4 text-muted-foreground">{explanation}</p>
      {notice && (
        <p role="status" className="mb-4 rounded-md bg-success-soft px-3 py-2 text-body font-medium text-success-text">
          {notice}
        </p>
      )}
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(code)
        }}
      >
        <label className="flex flex-col gap-1.5 font-medium">
          {text('code')}
          <OtpInput ref={field} name="code" required autoFocus value={code} invalid={Boolean(error)} onChange={setCode} onComplete={(complete) => !busy && onSubmit(complete)} />
        </label>
        {error && (
          <p role="alert" className="text-body font-medium text-danger-text">
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" loading={busy} className="min-h-10">
          {submitLabel}
        </Button>
        <div className="flex flex-wrap justify-center gap-x-2 sm:justify-between">
          <Button variant="ghost" onClick={onChangeAddress} className="min-h-10">
            {changeAddressLabel}
          </Button>
          <ResendCodeButton onResend={onResend} disabled={busy} cooldown={resendCooldown} />
        </div>
      </form>
    </AuthLayout>
  )
}
