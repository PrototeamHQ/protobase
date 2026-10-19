import { useState } from 'react'
import { AuthError, type AuthenticatorSetup } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { cn } from '../lib/cn'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { OtpInput } from '../primitives/otp-input'
import { BackupCodes } from './backup-codes'
import { TotpQr, totpKey } from './totp-qr'
import { text } from './messages'

export type TwoFactorSetupProps = {
  /** Offer emailed codes next to an authenticator app: mail can be sent, and the account does not have them on already. */
  offerEmailedCodes: boolean
  /** The account has a password, which turning on two-factor authentication asks for. */
  needsPassword: boolean
  /** Each step rejects with `AuthError`, which the form shows. */
  onStartApp: (password?: string) => Promise<AuthenticatorSetup>
  onConfirmApp: (code: string) => Promise<void>
  onEmailedCodes: (password?: string) => Promise<void>
  /** Two-factor authentication is on (and the backup codes were shown, for an app). */
  onDone: () => void
  onCancel?: () => void
}

type Step = { kind: 'choose' } | { kind: 'scan'; setup: AuthenticatorSetup } | { kind: 'backup-codes'; codes: string[] }
type Choice = 'app' | 'email'

const choices = (): Array<{ value: Choice; label: string; description: string }> => [
  { value: 'app', label: text('authenticatorApp'), description: text('authenticatorAppDescription') },
  { value: 'email', label: text('emailedCode'), description: text('emailedCodeDescription') },
]

/** Turns on two-factor authentication: choose the app or emailed codes, confirm the password, scan, and keep the backup codes. */
export const TwoFactorSetup = ({ offerEmailedCodes, needsPassword, onStartApp, onConfirmApp, onEmailedCodes, onDone, onCancel }: TwoFactorSetupProps) => {
  const [step, setStep] = useState<Step>({ kind: 'choose' })
  const [choice, setChoice] = useState<Choice>('app')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const offered = offerEmailedCodes ? choices() : choices().filter((option) => option.value === 'app')

  const attempt = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(undefined)
    try {
      await action()
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      setError(authMessage(failure))
    }
    setBusy(false)
  }

  const start = () =>
    attempt(async () => {
      const given = needsPassword ? password : undefined
      if (choice === 'email') {
        await onEmailedCodes(given)
        return onDone()
      }
      setStep({ kind: 'scan', setup: await onStartApp(given) })
    })

  const confirm = (setup: AuthenticatorSetup, entered = code) =>
    attempt(async () => {
      await onConfirmApp(entered)
      setStep({ kind: 'backup-codes', codes: setup.backupCodes })
    })

  const errorLine = error && (
    <p role="alert" className="text-xs font-medium text-danger-text">
      {error}
    </p>
  )

  if (step.kind === 'backup-codes') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground">{text('twoFactorIsOn')}</p>
        <BackupCodes codes={step.codes} />
        <Button variant="primary" onClick={onDone} className="min-h-10">
          {text('savedCodes')}
        </Button>
      </div>
    )
  }

  if (step.kind === 'scan') {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void confirm(step.setup)
        }}
      >
        <p className="text-muted-foreground">{text('scanCode')}</p>
        <div className="flex flex-col items-center gap-2">
          <TotpQr uri={step.setup.totpURI} className="size-44 rounded-md border" />
          <p className="text-center text-xs text-muted-foreground">
            {text('cannotScan')}
            <span className="mt-1 block break-all font-mono text-body text-foreground">{totpKey(step.setup.totpURI)}</span>
          </p>
        </div>
        <label className="flex flex-col gap-1.5 font-medium">
          {text('codeFromApp')}
          <OtpInput name="code" required autoFocus value={code} invalid={Boolean(error)} onChange={setCode} onComplete={(complete) => !busy && void confirm(step.setup, complete)} />
        </label>
        {errorLine}
        <Button variant="primary" type="submit" loading={busy} className="min-h-10">
          {text('turnOn')}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} className="min-h-10">
            {text('cancel')}
          </Button>
        )}
      </form>
    )
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void start()
      }}
    >
      <div role="radiogroup" aria-label={text('secondStep')} className="flex flex-col gap-2">
        {offered.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={choice === option.value}
            onClick={() => setChoice(option.value)}
            className={cn('rounded-md border p-3 text-left transition-colors', choice === option.value ? 'border-primary bg-primary-soft' : 'border-border-strong hover:bg-muted')}
          >
            <span className="block font-medium">{option.label}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{option.description}</span>
          </button>
        ))}
      </div>
      {needsPassword && (
        <label className="flex flex-col gap-1.5 font-medium">
          {text('yourPassword')}
          <Input type="password" name="password" autoComplete="current-password" required value={password} invalid={Boolean(error)} onChange={(event) => setPassword(event.target.value)} className="min-h-6" />
        </label>
      )}
      {errorLine}
      <Button variant="primary" type="submit" loading={busy} className="min-h-10">
        {text('continue')}
      </Button>
      {onCancel && (
        <Button variant="ghost" onClick={onCancel} className="min-h-10">
          {text('cancel')}
        </Button>
      )}
    </form>
  )
}
