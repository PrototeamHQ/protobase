import { storedScopes } from '../../personal-mail/linked-accounts'
import { holdsScopes } from '../../workflows/connections/connection-provider'
import type { ResolvedConnection } from './declared-connections'

/**
 * The connection an account is connected through, as `GET /connections` lists it: the account of a provider only
 * connections use, or a sign-in provider's account that holds a connection's scopes; undefined for an account that only
 * signs in.
 */
export const accountConnection = (connections: readonly ResolvedConnection[]) => (account: { providerId: string; scope?: string | null }) =>
  connections.find((connection) => connection.providerId === account.providerId && ('oauth' in connection.declaration || holdsScopes(storedScopes(account.scope), connection.declaration)))
