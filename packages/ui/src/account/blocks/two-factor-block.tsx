import { useCallback } from 'react'
import { useAuth } from '../../auth/auth-provider'
import { TwoFactorSection } from '../two-factor-section'
import { text } from '../messages'
import { AccountLoading } from './account-loading'
import { useAccountData } from './use-account-data'

/** The `TwoFactor` block: the signed-in person's two-factor authentication, within what the sign-in policy allows. */
export const TwoFactorBlock = () => {
  const { account } = useAuth().session
  const { data: methods, error, reload } = useAccountData(useCallback(() => account.signInMethods(), [account]), text('couldNotReadMethods'))
  if (!methods) return <AccountLoading error={error} />
  return (
    <TwoFactorSection
      rule={methods.policy.twoFactor}
      enabled={methods.account.twoFactor}
      authenticatorApp={methods.account.authenticatorApp}
      mail={methods.mail}
      needsPassword={methods.account.password}
      onStartApp={(password) => account.startAuthenticatorApp(password)}
      onConfirmApp={(code) => account.confirmAuthenticatorApp(code)}
      onEmailedCodes={(password) => account.turnOnEmailedCodes(password)}
      onTurnOff={(password) => account.turnOffTwoFactor(password)}
      onNewBackupCodes={(password) => account.newBackupCodes(password)}
      onChanged={reload}
    />
  )
}
