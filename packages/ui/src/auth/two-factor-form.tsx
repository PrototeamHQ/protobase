import { useState } from 'react'
import type { TwoFactorMethod } from '@protobase/client'
import { Button } from '../primitives/button'
import { Checkbox } from '../primitives/checkbox'
import { Input } from '../primitives/input'
import { AuthLayout } from './auth-layout'
import { CodeInput } from './code-input'

export type TwoFactorStep = TwoFactorMethod | 'backup'

export type TwoFactorFormProps = {
  /** The second steps the account has: an authenticator app (`totp`, which also takes backup codes) and emailed codes (`otp`). */
  methods: TwoFactorMethod[]
  /** Called with the code; the page shows `error` when it fails. */
  onVerify: (input: { method: TwoFactorStep; code: string; trustDevice: boolean }) => void
  /** Emails a code; asked for when the person chooses an emailed code. */
  onSendCode: () => void
  onBack: () => void
  busy?: boolean
  error?: string
  /** A code was emailed, so the emailed-code step asks for it. */
  codeSent?: boolean
  /** The step shown first; default the authenticator app when the account has one. */
  initialStep?: TwoFactorStep
}

const instructions: Record<TwoFactorStep, string> = {
  totp: 'Enter the 6-digit code from your authenticator app.',
  otp: 'Enter the 6-digit code we emailed you. It works for 5 minutes.',
  backup: 'Enter one of the backup codes you saved when you set up the authenticator app. Each works once.',
}

/** The second step of a sign-in, for an account with two-factor authentication. */
export const TwoFactorForm = ({ methods, onVerify, onSendCode, onBack, busy, error, codeSent, initialStep }: TwoFactorFormProps) => {
  const [step, setStep] = useState<TwoFactorStep>(initialStep ?? (methods.includes('totp') ? 'totp' : 'otp'))
  const [code, setCode] = useState('')
  const [trustDevice, setTrustDevice] = useState(false)
  const waitingForEmail = step === 'otp' && !codeSent

  const switchTo = (next: TwoFactorStep) => {
    setStep(next)
    setCode('')
    if (next === 'otp' && !codeSent) onSendCode()
  }

  return (
    <AuthLayout title="Two-factor authentication" description="One more step to sign in.">
      {waitingForEmail ? (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-muted-foreground">We email you a code to finish signing in.</p>
          {error && (
            <p role="alert" className="text-xs font-medium text-danger-text">
              {error}
            </p>
          )}
          <Button variant="primary" loading={busy} onClick={onSendCode} className="min-h-10">
            Email me a code
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            onVerify({ method: step, code: code.trim(), trustDevice })
          }}
        >
          <p className="text-[13px] text-muted-foreground">{instructions[step]}</p>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">
            {step === 'backup' ? 'Backup code' : 'Code'}
            {step === 'backup' ? (
              <Input name="code" autoComplete="off" spellCheck={false} required autoFocus value={code} invalid={Boolean(error)} onChange={(event) => setCode(event.target.value)} className="min-h-6 font-mono" />
            ) : (
              <CodeInput name="code" required autoFocus value={code} invalid={Boolean(error)} onChange={(event) => setCode(event.target.value)} />
            )}
          </label>
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Checkbox checked={trustDevice} onChange={setTrustDevice} label="Trust this browser" />
            Don't ask again in this browser for 30 days
          </label>
          {error && (
            <p role="alert" className="text-xs font-medium text-danger-text">
              {error}
            </p>
          )}
          <Button variant="primary" type="submit" loading={busy} className="min-h-10">
            Verify
          </Button>
        </form>
      )}
      <div className="mt-4 flex flex-col items-center gap-2 border-t pt-4 text-[13px]">
        {step !== 'totp' && methods.includes('totp') && (
          <button type="button" onClick={() => switchTo('totp')} className="font-medium text-primary-text hover:underline">
            Use the authenticator app
          </button>
        )}
        {step !== 'otp' && methods.includes('otp') && (
          <button type="button" onClick={() => switchTo('otp')} className="font-medium text-primary-text hover:underline">
            Email me a code instead
          </button>
        )}
        {step !== 'backup' && methods.includes('totp') && (
          <button type="button" onClick={() => switchTo('backup')} className="font-medium text-primary-text hover:underline">
            Use a backup code
          </button>
        )}
        <button type="button" onClick={onBack} className="font-medium text-muted-foreground hover:underline">
          Back to sign in
        </button>
      </div>
    </AuthLayout>
  )
}
