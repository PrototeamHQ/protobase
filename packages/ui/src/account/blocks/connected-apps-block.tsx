import { useCallback } from 'react'
import { useAuth } from '../../auth/auth-provider'
import { ConnectedAppsSection } from '../connected-apps-section'
import { text } from '../messages'
import { AccountLoading } from './account-loading'
import { useAccountData } from './use-account-data'

const Apps = () => {
  const { account } = useAuth().session
  const { data: apps, error, reload } = useAccountData(useCallback(() => account.connectedApps(), [account]), text('couldNotReadMethods'))
  if (!apps) return <AccountLoading error={error} />
  return <ConnectedAppsSection apps={apps} onDisconnect={(clientId) => account.disconnectApp(clientId).then(reload)} />
}

/** The `ConnectedApps` block: the apps the signed-in person allowed to act as them, hidden when the app has no MCP. */
export const ConnectedAppsBlock = () => (useAuth().mcp ? <Apps /> : null)
