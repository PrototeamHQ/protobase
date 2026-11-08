import type { AuthContext } from 'better-auth'
import { decryptOAuthToken } from 'better-auth/oauth2'
import { accountConnection } from './account-connection'
import type { ConnectionEvents } from './connection-events'
import { connectionRefusal } from './connection-refusal'
import type { ResolvedConnection } from './declared-connections'
import { releaseAccount } from './disconnect-account'

export type ReleaseUserConnectionsInput = { connections: readonly ResolvedConnection[]; events: ConnectionEvents; allowPrivateAddresses: boolean; context: () => Promise<AuthContext> }

/**
 * The user-deletion listener of connections: before a user is deleted, each of their accounts a connection lists is
 * released as disconnecting releases it (`releaseAccount`), and the deletion then deletes it. What stops a disconnect
 * stops the deletion with everything in place: no workflows listening to queue a revocation, refused before any
 * account is touched, or triggers that cannot be parked; deleting the user again finishes the job.
 */
export const releaseUserConnections = ({ connections, events, allowPrivateAddresses, context }: ReleaseUserConnectionsInput) => {
  const connectionOf = accountConnection(connections)
  return async (userId: string) => {
    const auth = await context()
    const released = (await auth.internalAdapter.findAccounts(userId)).flatMap((account) => {
      const connection = connectionOf(account)
      return connection ? [{ account, connection }] : []
    })
    if (released.some(({ connection }) => connection.revocationUrl) && !events.listening()) throw connectionRefusal('SERVICE_UNAVAILABLE', 'CONNECTIONS_STARTING', undefined)
    for (const { account, connection } of released) {
      await releaseAccount({ account, connection, events, decrypt: (stored) => decryptOAuthToken(stored, auth), secret: auth.secretConfig, allowPrivateAddresses })
    }
  }
}
