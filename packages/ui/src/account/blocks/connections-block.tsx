import { useCallback, useState } from 'react'
import { providerMessage } from '../../auth/auth-messages'
import { useAuth } from '../../auth/auth-provider'
import { ConnectionsSection } from '../connections-section'
import { text } from '../messages'
import { AccountLoading } from './account-loading'
import { takeLinkError } from './connected-accounts-block'
import { useAccountData } from './use-account-data'

/** The `Connections` block: the accounts the signed-in person connected for their workflows, hidden when the app's plugins declare none. */
export const ConnectionsBlock = () => {
  const { session, connectAccount } = useAuth()
  const { account } = session
  const [linkError] = useState(takeLinkError)
  const { data: connections, error, reload } = useAccountData(useCallback(() => account.workflowConnections(), [account]), text('couldNotReadMethods'))
  if (!connections) return <AccountLoading error={error} />
  if (connections.length === 0) return null
  return <ConnectionsSection connections={connections} onConnect={connectAccount} onDisconnect={(id) => account.disconnectAccount(id).then(reload)} error={linkError && providerMessage(linkError, text('theProvider'))} />
}
