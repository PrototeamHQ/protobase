import { useState } from 'react'
import type { TwoFactorMethod } from '@protobase/client'
import { emailCodeMinutes } from '@protobase/schema/internal'
import { Button } from '../primitives/button'
import { Checkbox } from '../primitives/checkbox'
import { Input } from '../primitives/input'
import { OtpInput } from '../primitives/otp-input'
import { AuthLayout } from './auth-layout'
import { text } from './messages'

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

const instructions = { totp: 'totpInstruction', otp: 'otpInstruction', backup: 'backupInstruction' } as const satisfies Record<TwoFactorStep, string>

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
    <AuthLayout title={text('twoFactorTitle')} description={text('twoFactorDescription')}>
      {waitingForEmail ? (
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground">{text('codeToFinish')}</p>
          {error && (
            <p role="alert" className="text-body font-medium text-danger-text">
              {error}
            </p>
          )}
          <Button variant="primary" loading={busy} onClick={onSendCode} className="min-h-10">
            {text('emailCode')}
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
          <p className="text-muted-foreground">{text(instructions[step], { minutes: emailCodeMinutes })}</p>
          <label className="flex flex-col gap-1.5 font-medium">
            {step === 'backup' ? text('backupCode') : text('code')}
            {step === 'backup' ? (
              <Input name="code" autoComplete="off" spellCheck={false} required autoFocus value={code} invalid={Boolean(error)} onChange={(event) => setCode(event.target.value)} className="min-h-6 font-mono" />
            ) : (
              <OtpInput name="code" required autoFocus value={code} invalid={Boolean(error)} onChange={setCode} />
            )}
          </label>
          <label className="flex items-center gap-2 text-muted-foreground">
            <Checkbox checked={trustDevice} onChange={setTrustDevice} label={text('trustBrowser')} />
            {text('trustBrowserFor')}
          </label>
          {error && (
            <p role="alert" className="text-body font-medium text-danger-text">
              {error}
            </p>
          )}
          <Button variant="primary" type="submit" loading={busy} className="min-h-10">
            {text('verify')}
          </Button>
        </form>
      )}
      <div className="mt-4 flex flex-col items-center gap-2 border-t pt-4">
        {step !== 'totp' && methods.includes('totp') && (
          <button type="button" onClick={() => switchTo('totp')} className="font-medium text-primary-text hover:underline">
            {text('useAuthenticator')}
          </button>
        )}
        {step !== 'otp' && methods.includes('otp') && (
          <button type="button" onClick={() => switchTo('otp')} className="font-medium text-primary-text hover:underline">
            {text('emailCodeInstead')}
          </button>
        )}
        {step !== 'backup' && methods.includes('totp') && (
          <button type="button" onClick={() => switchTo('backup')} className="font-medium text-primary-text hover:underline">
            {text('useBackupCode')}
          </button>
        )}
        <button type="button" onClick={onBack} className="font-medium text-muted-foreground hover:underline">
          {text('backToSignIn')}
        </button>
      </div>
    </AuthLayout>
  )
}
