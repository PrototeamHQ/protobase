import type { ConnectionDeclaration, ConnectionError } from '@protobase/workflows/plugin'
import type { ConnectionAccount, ConnectionAccounts } from './connection-accounts'
import { connectionProviderId, holdsScopes } from './connection-provider'
import type { sharedRefresh } from './connection-tokens'

/** The account a connection signs in through: the person's account of this id, and what the connection asks of it. */
export type AccountUse = { userId: string; accountId: string; plugin: string; name: string; declaration: ConnectionDeclaration; secret: (token: string) => void }

export type AccountTokenInput = { accounts: ConnectionAccounts; refresh: ReturnType<typeof sharedRefresh> }

/**
 * An access token of a person's account, while it is theirs, of the connection's provider and with its scopes: checked
 * before the token is fetched and again once it is, so an account disconnected or linked to someone else meanwhile
 * gives none (`refused`). The token goes to `secret` as soon as it is fetched, so it is blanked out even when it is
 * then refused. Undefined when the provider refused the refresh.
 */
export const accountToken = ({ accounts, refresh }: AccountTokenInput) => async (use: AccountUse, refused: () => ConnectionError) => {
  const fits = (account: ConnectionAccount | undefined): account is ConnectionAccount =>
    account !== undefined && account.providerId === connectionProviderId(use.plugin, use.name, use.declaration) && holdsScopes(account.scopes, use.declaration)
  const account = await accounts.find(use.userId, use.accountId)
  if (!fits(account)) throw refused()
  const token = await refresh(use.userId, account.id, account.refreshToken)
  if (!token) return
  use.secret(token)
  if (!fits(await accounts.find(use.userId, account.id))) throw refused()
  return token
}
