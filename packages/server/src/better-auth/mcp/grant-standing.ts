import type { DBAdapter } from 'better-auth'
import { unauthorized } from '../../problem'
import { exists } from '../store/store-reads'
import { consentModel } from './consent-check'

type Adapter = Pick<DBAdapter, 'findMany'>

/** What an MCP access token claims about its grant: its person (`sub`), its client (`client_id`) and when it was issued (`iat`, in seconds). */
export type GrantClaims = { userId: string; clientId?: string; issuedAt?: number }

/**
 * Whether an MCP access token's grant still stands, read from the store on every request: the person still allows its
 * client with a consent made no later than the token. Disconnecting the client, or securing the account, deletes the
 * consents (`revokeMcpGrants`), so its access tokens stop at once instead of working out their 15 minutes, and stay
 * stopped when the person allows the client again, whose new consent is newer than them. Not the browser session that
 * allowed the client: the grant outlives it. A lookup that fails is not caught.
 */
export const checkMcpGrant = async (adapter: Adapter, { userId, clientId, issuedAt }: GrantClaims) => {
  if (clientId === undefined) throw unauthorized('The access token names no client')
  if (issuedAt === undefined) throw unauthorized('The access token has no issue time')
  // Both are whole seconds: the provider dates a consent it creates by the same clock it stamps `iat` with.
  const where = [{ field: 'userId', value: userId }, { field: 'clientId', value: clientId }, { field: 'createdAt', operator: 'lte' as const, value: new Date(issuedAt * 1000) }]
  if (!(await exists(adapter, consentModel, where))) throw unauthorized('The client was disconnected: connect it again')
}
