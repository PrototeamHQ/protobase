import { useCallback } from 'react'
import { useAuth } from '../../auth/auth-provider'
import { useAdminMeta } from '../../app/meta-gate'
import { ConnectedAppsSection } from '../connected-apps-section'
import { McpAddressSection } from '../mcp-address-section'
import { text } from '../messages'
import { AccountLoading } from './account-loading'
import { useAccountData } from './use-account-data'

const Apps = () => {
  const { account } = useAuth().session
  const { data: apps, error, reload } = useAccountData(useCallback(() => account.connectedApps(), [account]), text('couldNotReadMethods'))
  if (!apps) return <AccountLoading error={error} />
  return <ConnectedAppsSection apps={apps} onDisconnect={(clientId) => account.disconnectApp(clientId).then(reload)} />
}

const Mcp = ({ url }: { url: string }) => (
  <>
    <McpAddressSection url={url} appName={useAdminMeta().appName} />
    <Apps />
  </>
)

/**
 * The `ConnectedApps` block: the address of the app's MCP endpoint and the apps the signed-in person allowed to act as
 * them, hidden when the app has no MCP.
 */
export const ConnectedAppsBlock = () => {
  const { mcp } = useAuth()
  return mcp ? <Mcp url={mcp.url} /> : null
}
