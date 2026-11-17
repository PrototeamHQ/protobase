import { useCallback } from 'react'
import { useAuth } from '../../auth/auth-provider'
import { DevicesSection } from '../devices-section'
import { text } from '../messages'
import { AccountLoading } from './account-loading'
import { useAccountData } from './use-account-data'

/**
 * The `Devices` block: the browsers and apps signed in as the person, this one marked, the others to sign out; and the
 * devices the platform links, when it links any.
 */
export const DevicesBlock = () => {
  const { session, staffSignIn, deviceLinks } = useAuth()
  const { account } = session
  const read = useCallback(async () => {
    const [sessions, links] = await Promise.all([account.sessions(), deviceLinks ? account.deviceLinks() : []])
    return { sessions, links }
  }, [account, deviceLinks])
  const { data, error, reload } = useAccountData(read, text('couldNotReadDevices'))
  if (!data) return <AccountLoading error={error} />
  return (
    <DevicesSection
      sessions={data.sessions}
      links={data.links}
      operator={staffSignIn}
      onSignOut={(token) => account.revokeSession(token).then(reload)}
      onSignOutOthers={() => account.revokeOtherSessions().then(reload)}
      onSignOutLink={(id) => account.signOutDeviceLink(id).then(reload)}
    />
  )
}
