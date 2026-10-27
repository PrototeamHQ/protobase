import { useCallback } from 'react'
import { useAuth } from '../../auth/auth-provider'
import { DeleteAccountSection } from '../delete-account-section'
import { text } from '../messages'
import { AccountLoading } from './account-loading'
import { useAccountData } from './use-account-data'

/** The `DeleteAccount` block: the signed-in person deletes their own account, which signs them out; staff signed in as them cannot. */
export const DeleteAccountBlock = () => {
  const { session, state, deleteAccount } = useAuth()
  const { account } = session
  const { data: methods, error } = useAccountData(useCallback(() => account.signInMethods(), [account]), text('couldNotReadMethods'))
  if (!methods) return <AccountLoading error={error} />
  return <DeleteAccountSection hasPassword={methods.account.password} staff={state.kind === 'signed-in' && Boolean(state.staff)} onDelete={deleteAccount} />
}
