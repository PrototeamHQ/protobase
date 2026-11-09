import { APIError } from 'better-auth/api'
import type { AuthContext } from 'better-auth'
import { decodeJwt, errors } from 'jose'
import { watchRefusals } from '../better-auth/refresh-refusals'
import { PersonalMailError } from './personal-mail-error'

/**
 * A provider account linked to a user: its row id, its provider, the scopes it holds, when it was created, and its own
 * mail address, when the provider's ID token names it.
 */
export type LinkedAccount = { id: string; providerId: string; scopes: string[]; createdAt: Date; address?: string }

/** The provider accounts linked to people and their access tokens, as `personalMailer` reads them. */
export type LinkedAccounts = {
  accounts: (userId: string) => Promise<LinkedAccount[]>
  /** A valid access token of the account, refreshed first when it expired; `link_expired` when it cannot be. */
  accessToken: (userId: string, account: LinkedAccount, provider: string) => Promise<string>
}

type AccountSelection = { body: { accountId: string; userId: string } }
type TokenApi = { getAccessToken: (input: AccountSelection) => Promise<{ accessToken: string }>; refreshToken: (input: AccountSelection) => Promise<{ accessToken?: string }> }

/** What `betterAuthLinkedAccounts` reads: the instance's context and its access-token and refresh endpoints. */
export type TokenAuth = { $context: Promise<AuthContext>; api: TokenApi }

/**
 * The verified address the account's ID token names, as Google's does with the `email` scope sign-in asks for. The
 * token came from the provider's token endpoint to the server itself, which stores it, so it is read without checking
 * its signature again; a token that is missing, not a JWT or names no verified address names none.
 */
export const idTokenAddress = (idToken: string | null | undefined) => {
  if (!idToken) return
  const claims = jwtClaims(idToken)
  if (!claims || typeof claims.email !== 'string' || claims.email_verified === false) return
  return claims.email
}

const jwtClaims = (token: string) => {
  try {
    return decodeJwt(token)
  } catch (error) {
    if (error instanceof errors.JWTInvalid) return
    throw error
  }
}

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
    return accounts.map((account) => {
      const address = idTokenAddress(account.idToken)
      return { id: account.id, providerId: account.providerId, scopes: storedScopes(account.scope), createdAt: account.createdAt, ...(address && { address }) }
    })
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

/**
 * A new access token of the account, refreshed with its refresh token even before the stored one expires, for a token
 * the provider refused early. Better Auth keeps the stored refresh token when the provider answers none. Undefined when
 * the provider refused the refresh token or the account holds none; a refresh that failed otherwise throws.
 */
export const accountRefreshedToken = async (auth: TokenAuth, userId: string, accountId: string) => {
  const answer = await watchRefusals(() => auth.api.refreshToken({ body: { accountId, userId } }))
  if ('value' in answer) return answer.value.accessToken || undefined
  if (!(answer.error instanceof APIError)) throw answer.error
  if (answer.error.body?.code === 'REFRESH_TOKEN_NOT_FOUND') return
  if (answer.refused && answer.error.body?.code === 'FAILED_TO_REFRESH_ACCESS_TOKEN') return
  throw answer.error
}
