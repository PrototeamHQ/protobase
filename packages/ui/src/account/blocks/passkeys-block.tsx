import { useCallback } from 'react'
import { useAuth } from '../../auth/auth-provider'
import { PasskeysSection } from '../passkeys-section'
import { text } from '../messages'
import { AccountLoading } from './account-loading'
import { useAccountData } from './use-account-data'

/** The `Passkeys` block: the signed-in person's passkeys, within what the sign-in policy allows. */
export const PasskeysBlock = () => {
  const { account } = useAuth().session
  const load = useCallback(() => Promise.all([account.signInMethods(), account.passkeys()]), [account])
  const { data, error, reload } = useAccountData(load, text('couldNotReadMethods'))
  if (!data) return <AccountLoading error={error} />
  const [methods, passkeys] = data
  return (
    <PasskeysSection
      rule={methods.policy.passkey}
      passkeys={passkeys}
      onAdd={() => account.addPasskey().then(reload)}
      onRename={(id, name) => account.renamePasskey(id, name).then(reload)}
      onRemove={(id) => account.removePasskey(id).then(reload)}
    />
  )
}
