import { useCallback } from 'react'
import { useAuth } from '../../auth/auth-provider'
import { DevicesSection } from '../devices-section'
import { text } from '../messages'
import { AccountLoading } from './account-loading'
import { useAccountData } from './use-account-data'

/** The `Devices` block: the browsers and apps signed in as the person, this one marked, the others to sign out. */
export const DevicesBlock = () => {
  const { session, staffSignIn } = useAuth()
  const { account } = session
  const { data: sessions, error, reload } = useAccountData(useCallback(() => account.sessions(), [account]), text('couldNotReadDevices'))
  if (!sessions) return <AccountLoading error={error} />
  return (
    <DevicesSection
      sessions={sessions}
      operator={staffSignIn}
      onSignOut={(token) => account.revokeSession(token).then(reload)}
      onSignOutOthers={() => account.revokeOtherSessions().then(reload)}
    />
  )
}
