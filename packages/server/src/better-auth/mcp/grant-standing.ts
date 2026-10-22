import type { DBAdapter } from 'better-auth'
import { unauthorized } from '../../problem'
import { consentModel } from './consent-check'

type Adapter = Pick<DBAdapter, 'findOne'>

/**
 * Whether an MCP access token's grant still stands, read from the store on every request: the person (`userId`, the
 * token's `sub`) still allows its client (`clientId`, its `client_id`). Disconnecting the client, or securing the
 * account, deletes the consent (`revokeMcpGrants`), so its access tokens stop at once instead of working out their 15
 * minutes. Not the browser session that allowed the client: the grant outlives it. A lookup that fails is not caught.
 */
export const checkMcpGrant = async (adapter: Adapter, userId: string, clientId: string | undefined) => {
  if (clientId === undefined) throw unauthorized('The access token names no client')
  const consent = await adapter.findOne({ model: consentModel, where: [{ field: 'userId', value: userId }, { field: 'clientId', value: clientId }] })
  if (!consent) throw unauthorized('The client was disconnected: connect it again')
}
