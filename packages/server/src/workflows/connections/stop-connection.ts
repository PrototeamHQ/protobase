import { ConnectionError, type ConnectionDeclaration, type PluginConnection } from '@protobase/workflows/plugin'
import { accountToken } from './account-token'
import type { ConnectionAccounts } from './connection-accounts'
import type { ConnectionTexts } from './connection-texts'
import type { sharedRefresh } from './connection-tokens'

/** A stopped trigger's connection: the plugin's declaration of it, the account and person its row recorded, and where its tokens go to be blanked out. */
export type StopUse = { plugin: string; name: string; declaration: ConnectionDeclaration; accountId: string | null; userId: string | null; secret: (token: string) => void }

export type StopConnectionInput = { accounts: ConnectionAccounts; refresh: ReturnType<typeof sharedRefresh>; text: ConnectionTexts }

/**
 * The connection a stopped trigger's unsubscribe signs in with, once its workflow's consent was withdrawn: only the
 * account its row recorded, while that account still belongs to the person its row recorded as having turned it on,
 * of the connection's provider and with its scopes, before and after its token is fetched. A row that recorded
 * neither, as one from before they were kept, gets nothing. A refresh the provider refuses is `not_connected` too: the subscription stays, recorded, until its
 * owner ends it. Each `accessToken()` checks afresh, caching nothing; only the trigger stop job holds one.
 */
export const stopConnection = ({ accounts, refresh, text }: StopConnectionInput) => (use: StopUse): PluginConnection => {
  const tokenOf = accountToken({ accounts, refresh })
  const key = `${use.plugin}:${use.name}`
  const notConnected = () => new ConnectionError('not_connected', text('stopNotConnected', { key }))
  return {
    accessToken: async (options) => {
      if (!use.accountId || !use.userId) throw notConnected()
      const token = await tokenOf({ ...use, userId: use.userId, accountId: use.accountId }, notConnected, options)
      if (!token) throw new ConnectionError('not_connected', text('stopLinkExpired', { key }))
      return token
    },
  }
}
