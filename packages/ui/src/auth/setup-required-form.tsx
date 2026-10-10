import { KeyRound } from 'lucide-react'
import type { RequiredSetup } from '@protobase/client'
import { TwoFactorSetup, type TwoFactorSetupProps } from '../account/two-factor-setup'
import { Button } from '../primitives/button'
import { AuthLayout } from './auth-layout'

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

const titles: Record<RequiredSetup, string> = { twoFactor: 'Turn on two-factor authentication', passkey: 'Add a passkey' }

/** Shown after signing in while the account lacks something the sign-in policy requires; the app opens once it is set up. */
export const SetupRequiredForm = ({ step, twoFactor, onAddPasskey, busy, error, onSignOut }: SetupRequiredFormProps) => (
  <AuthLayout title={titles[step]} description="This app requires it for every account.">
    {step === 'twoFactor' ? (
      <TwoFactorSetup {...twoFactor} />
    ) : (
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-muted-foreground">A passkey signs you in with Face ID, Touch ID, Windows Hello, your phone or a security key. Your browser asks which one to use.</p>
        {error && (
          <p role="alert" className="text-xs font-medium text-danger-text">
            {error}
          </p>
        )}
        <Button variant="primary" loading={busy} onClick={onAddPasskey} className="min-h-10">
          <KeyRound className="size-4" />
          Add a passkey
        </Button>
      </div>
    )}
    <button type="button" onClick={onSignOut} className="mt-4 w-full text-center text-[13px] font-medium text-muted-foreground hover:underline">
      Sign out
    </button>
  </AuthLayout>
)
