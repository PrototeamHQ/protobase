import { accountAccessToken, accountRefreshedToken, storedScopes, type TokenAuth } from '../../personal-mail/linked-accounts'

/** One of a person's linked accounts, as a connection reads it: its provider, scopes and the stored refresh token's text. */
export type ConnectionAccount = { id: string; providerId: string; scopes: string[]; refreshToken: string | null }

/** The linked accounts connections go through, and their access tokens. */
export type ConnectionAccounts = {
  /** The person's account of this id; undefined when they have none, as after a disconnect. */
  find: (userId: string, accountId: string) => Promise<ConnectionAccount | undefined>
  /**
   * A valid access token, refreshed first when it expired, or always with `refresh`; undefined when the provider refused
   * the refresh.
   */
  accessToken: (userId: string, accountId: string, options?: { refresh?: boolean }) => Promise<string | undefined>
}

/** The accounts Better Auth keeps, read through its internal adapter, with its refreshing `getAccessToken`. */
export const betterAuthConnectionAccounts = (auth: TokenAuth): ConnectionAccounts => ({
  find: async (userId, accountId) => {
    const account = (await (await auth.$context).internalAdapter.findAccounts(userId)).find((candidate) => candidate.id === accountId)
    if (!account) return
    return { id: account.id, providerId: account.providerId, scopes: storedScopes(account.scope), refreshToken: account.refreshToken ?? null }
  },
  accessToken: (userId, accountId, options) => (options?.refresh ? accountRefreshedToken(auth, userId, accountId) : accountAccessToken(auth, userId, accountId)),
})
