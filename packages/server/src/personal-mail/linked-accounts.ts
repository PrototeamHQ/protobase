import { APIError } from 'better-auth/api'
import type { AuthContext } from 'better-auth'
import { watchRefusals } from '../better-auth/refresh-refusals'
import { PersonalMailError } from './personal-mail-error'

/** A provider account linked to a user: its row id, its provider, the scopes it holds and when it was created. */
export type LinkedAccount = { id: string; providerId: string; scopes: string[]; createdAt: Date }

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
export const storedScopes = (scope: string | null | undefined) => (scope ?? '').split(/[\s,]+/).filter(Boolean)

/**
 * The accounts Better Auth keeps, with the tokens it stores, decrypted when `encryptOAuthTokens` is on. Its
 * `getAccessToken` refreshes a token within five seconds of expiry with the provider's refresh token and stores the new
 * one; when the provider refuses the refresh token, as for a revoked grant, that is `link_expired`.
 */
export const betterAuthLinkedAccounts = (auth: TokenAuth): LinkedAccounts => ({
  accounts: async (userId) => {
    const accounts = await (await auth.$context).internalAdapter.findAccounts(userId)
    return accounts.map((account) => ({ id: account.id, providerId: account.providerId, scopes: storedScopes(account.scope), createdAt: account.createdAt }))
  },
  accessToken: async (userId, account, provider) => {
    const accessToken = await accountAccessToken(auth, userId, account.id)
    if (!accessToken) throw new PersonalMailError('link_expired', provider)
    return accessToken
  },
})

/**
 * A valid access token of the account, refreshed first when it expired; undefined when the provider refused the refresh
 * token (`invalid_grant`) or the account holds none. A refresh that failed otherwise, as when the provider was down,
 * throws, so the caller tries again later rather than asking the person to connect the account again.
 */
export const accountAccessToken = async (auth: TokenAuth, userId: string, accountId: string) => {
  const answer = await watchRefusals(() => auth.api.getAccessToken({ body: { accountId, userId } }))
  if ('value' in answer) return answer.value.accessToken || undefined
  if (answer.refused && answer.error instanceof APIError && answer.error.body?.code === 'FAILED_TO_GET_ACCESS_TOKEN') return
  throw answer.error
}
