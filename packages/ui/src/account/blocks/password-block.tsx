import { useCallback } from 'react'
import { useAuth } from '../../auth/auth-provider'
import { PasswordSection } from '../password-section'
import { text } from '../messages'
import { AccountLoading } from './account-loading'
import { useAccountData } from './use-account-data'

/**
 * The `Password` block: the signed-in person changes their password, or sets a first one without signing anyone out,
 * within what the sign-in policy allows; staff signed in as the person cannot.
 */
export const PasswordBlock = () => {
  const { session, state } = useAuth()
  const { account } = session
  const { data: methods, error, reload } = useAccountData(useCallback(() => account.signInMethods(), [account]), text('couldNotReadMethods'))
  if (!methods) return <AccountLoading error={error} />
  return (
    <PasswordSection
      rule={methods.policy.password}
      hasPassword={methods.account.password}
      staff={state.kind === 'signed-in' && Boolean(state.staff)}
      onChange={(current, next) => account.changePassword(current, next).then(reload)}
      onSet={(next) => account.setPassword(next).then(reload)}
    />
  )
}
