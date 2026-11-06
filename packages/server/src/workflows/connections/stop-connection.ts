import { ConnectionError, type ConnectionDeclaration, type PluginConnection } from '@protobase/workflows/plugin'
import type { ConnectionAccounts } from './connection-accounts'
import { connectionProviderId, holdsScopes } from './connection-provider'
import type { sharedRefresh } from './connection-tokens'

/** A stopped trigger's connection: the plugin's declaration of it, the account and person its row recorded, and where its tokens go to be blanked out. */
export type StopUse = { plugin: string; name: string; declaration: ConnectionDeclaration; accountId: string | null; userId: string | null; secret: (token: string) => void }

export type StopConnectionInput = { accounts: ConnectionAccounts; refresh: ReturnType<typeof sharedRefresh> }

/**
 * The connection a stopped trigger's unsubscribe signs in with, once its workflow's consent was withdrawn: only the
 * account its row recorded, while that account still belongs to the person its row recorded as having turned it on,
 * of the connection's provider and with its scopes. A row that recorded neither, as one from before they were kept,
 * gets nothing. A refresh the provider refuses is `not_connected` too: the subscription stays, recorded, until its
 * owner ends it. Each `accessToken()` checks afresh, caching nothing; only the trigger stop job holds one.
 */
export const stopConnection = ({ accounts, refresh }: StopConnectionInput) => (use: StopUse): PluginConnection => {
  const key = `${use.plugin}:${use.name}`
  const notConnected = () => new ConnectionError('not_connected', `This trigger has no connection it may end its subscription with for ${key}: the account it was made with is no longer connected`)
  return {
    accessToken: async () => {
      if (!use.accountId || !use.userId) throw notConnected()
      const account = await accounts.find(use.userId, use.accountId)
      if (!account || account.providerId !== connectionProviderId(use.plugin, use.name, use.declaration) || !holdsScopes(account.scopes, use.declaration)) throw notConnected()
      const token = await refresh(use.userId, account.id, account.refreshToken)
      if (!token) throw new ConnectionError('not_connected', `The account connected for ${key} no longer signs in, so this trigger cannot end its subscription with it`)
      use.secret(token)
      return token
    },
  }
}
