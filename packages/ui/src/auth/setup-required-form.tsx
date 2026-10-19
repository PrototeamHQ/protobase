import { KeyRound } from 'lucide-react'
import type { RequiredSetup } from '@protobase/client'
import { TwoFactorSetup, type TwoFactorSetupProps } from '../account/two-factor-setup'
import { Button } from '../primitives/button'
import { AuthLayout } from './auth-layout'
import { text } from './messages'

export type SetupRequiredFormProps = {
  /** What the sign-in policy requires next. */
  step: RequiredSetup
  /** Turning on two-factor authentication, for `twoFactor`. */
  twoFactor: Omit<TwoFactorSetupProps, 'onCancel'>
  /** Adds a passkey, for `passkey`; the page shows `error` when it fails. */
  onAddPasskey: () => void
  busy?: boolean
  error?: string
  onSignOut: () => void
}

const title = (step: RequiredSetup) => (step === 'twoFactor' ? text('turnOnTwoFactor') : text('addPasskey'))

/** Shown after signing in while the account lacks something the sign-in policy requires; the app opens once it is set up. */
export const SetupRequiredForm = ({ step, twoFactor, onAddPasskey, busy, error, onSignOut }: SetupRequiredFormProps) => (
  <AuthLayout title={title(step)} description={text('requiredForEveryAccount')}>
    {step === 'twoFactor' ? (
      <TwoFactorSetup {...twoFactor} />
    ) : (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground">{text('passkeyExplanation')}</p>
        {error && (
          <p role="alert" className="text-body font-medium text-danger-text">
            {error}
          </p>
        )}
        <Button variant="primary" loading={busy} onClick={onAddPasskey} className="min-h-10">
          <KeyRound className="size-4" />
          {text('addPasskey')}
        </Button>
      </div>
    )}
    <button type="button" onClick={onSignOut} className="mt-4 w-full text-center font-medium text-muted-foreground hover:underline">
      {text('signOut')}
    </button>
  </AuthLayout>
)
