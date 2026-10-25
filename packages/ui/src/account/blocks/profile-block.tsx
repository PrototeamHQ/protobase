import { useCallback } from 'react'
import { useAuth } from '../../auth/auth-provider'
import { ProfileSection } from '../profile-section'
import { text } from '../messages'
import { AccountLoading } from './account-loading'
import { useAccountData } from './use-account-data'

/** The `Profile` block: the signed-in person's name and address, which they can change; the address only with mail. */
export const ProfileBlock = () => {
  const { session, changeEmail } = useAuth()
  const { data: user, loaded, error, reload } = useAccountData(useCallback(() => session.session(), [session]), text('couldNotReadProfile'))
  if (!loaded) return <AccountLoading error={error} />
  if (!user) return null
  const emailChange = changeEmail ? { request: session.account.requestEmailChange, confirm: session.account.changeEmail } : undefined
  return <ProfileSection name={user.name} email={user.email} onRename={(name) => session.account.updateName(name).then(reload)} emailChange={emailChange} onEmailChanged={reload} />
}
