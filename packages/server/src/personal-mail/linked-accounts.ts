import { APIError } from 'better-auth/api'
import type { AuthContext } from 'better-auth'
import { PersonalMailError } from './personal-mail-error'

/** A provider account linked to a user: its row id, its provider and the scopes it was granted. */
export type LinkedAccount = { id: string; providerId: string; scopes: string[] }

/** The provider accounts linked to people and their access tokens, as `personalMailer` reads them. */
export type LinkedAccounts = {
  accounts: (userId: string) => Promise<LinkedAccount[]>
  /** A valid access token of the account, refreshed first when it expired; `link_expired` when it cannot be. */
  accessToken: (userId: string, account: LinkedAccount, provider: string) => Promise<string>
}

type TokenApi = { getAccessToken: (input: { body: { accountId: string; userId: string } }) => Promise<{ accessToken: string }> }

/** What `betterAuthLinkedAccounts` reads: the instance's context and its access-token endpoint. */
export type TokenAuth = { $context: Promise<AuthContext>; api: TokenApi }

// Better Auth keeps the scopes comma-separated; a provider's token response may have given them space-separated.
const storedScopes = (scope: string | null | undefined) => (scope ?? '').split(/[\s,]+/).filter(Boolean)

/**
 * The accounts Better Auth keeps, with the tokens it stores, decrypted when `encryptOAuthTokens` is on. Its
 * `getAccessToken` refreshes a token within five seconds of expiry with the provider's refresh token and stores the new
 * one; when the provider refuses the refresh, as for a revoked grant, that is `link_expired`.
 */
export const betterAuthLinkedAccounts = (auth: TokenAuth): LinkedAccounts => ({
  accounts: async (userId) => {
    const accounts = await (await auth.$context).internalAdapter.findAccounts(userId)
    return accounts.map((account) => ({ id: account.id, providerId: account.providerId, scopes: storedScopes(account.scope) }))
  },
  accessToken: async (userId, account, provider) => {
    const accessToken = await validAccessToken(auth, userId, account.id, provider)
    if (!accessToken) throw new PersonalMailError('link_expired', provider)
    return accessToken
  },
})

const validAccessToken = async (auth: TokenAuth, userId: string, accountId: string, provider: string) => {
  try {
    return (await auth.api.getAccessToken({ body: { accountId, userId } })).accessToken
  } catch (error) {
    if (error instanceof APIError && error.body?.code === 'FAILED_TO_GET_ACCESS_TOKEN') throw new PersonalMailError('link_expired', provider)
    throw error
  }
}
