import { storedScopes } from '../../personal-mail/linked-accounts'
import { holdsScopes } from '../../workflows/connections/connection-provider'
import type { ConnectionEvents } from './connection-events'
import type { ResolvedConnection } from './declared-connections'

// The fields of a stored account the list reads; the store's rows carry its tokens too, which it never reads.
type StoredAccount = { id: string; providerId: string; scope?: string | null; createdAt: Date }

export type ListConnectionsInput = {
  findAccounts: (userId: string) => Promise<StoredAccount[]>
  connections: readonly ResolvedConnection[]
  events: Pick<ConnectionEvents, 'needsSignIn' | 'uses'>
}

/**
 * A person's connections: each connection the app's workflow plugins declare with the person's accounts that fit it,
 * whether a trigger waits for one to be signed in again, and the workflows that use it. Each account's fields are picked
 * one by one, so no token leaves. `user` is the signed-in person's own id, from their session; reading without one fails,
 * since the store would read every person's accounts.
 */
export const listConnections = async ({ findAccounts, connections, events }: ListConnectionsInput, user: string | number) => {
  if (user === '' || user === undefined || user === null) throw new Error("Connections are listed for a signed-in person's id")
  const userId = String(user)
  const accounts = await findAccounts(userId)
  const fitting = (connection: ResolvedConnection) => accounts.filter((account) => account.providerId === connection.providerId && holdsScopes(storedScopes(account.scope), connection.declaration))
  const ids = connections.flatMap((connection) => fitting(connection).map((account) => account.id))
  const waiting = new Set(await events.needsSignIn(ids))
  const uses = await events.uses(userId, ids)
  return connections.map((connection) => ({
    key: connection.key,
    label: connection.declaration.label,
    provider: connection.providerId,
    scopes: connection.declaration.scopes ?? [],
    link_params: connection.declaration.link_params ?? {},
    accounts: fitting(connection).map((account) => ({ id: account.id, scopes: storedScopes(account.scope), created_at: account.createdAt, needs_sign_in: waiting.has(account.id), used_by: uses[account.id] ?? [] })),
  }))
}

export type ListedConnection = Awaited<ReturnType<typeof listConnections>>[number]
