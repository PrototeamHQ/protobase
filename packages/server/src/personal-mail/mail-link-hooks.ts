import type { BetterAuthOptions } from 'better-auth'
import { getOAuthState } from 'better-auth/api'
import { storedScopes } from './linked-accounts'
import type { PersonalMailProvider } from './personal-mail-provider'

type AccountHooks = NonNullable<NonNullable<BetterAuthOptions['databaseHooks']>['account']>
type AfterWrite = NonNullable<NonNullable<AccountHooks['update']>['after']>
type AccountRow = { id: string; userId: string; providerId: string; scope?: string | null }

const holds = (scope: string | null | undefined, scopes: string[]) => scopes.every((wanted) => storedScopes(scope).includes(wanted))

/** The mail provider whose scopes `account` holds, of the app's `providers`. */
export const mailProviderOf = (providers: PersonalMailProvider[], account: AccountRow) => providers.find((candidate) => candidate.signInProvider === account.providerId && holds(account.scope, candidate.scopes))

/**
 * The new scopes of `userAccounts` once `linked` holds `provider`'s mail scopes: each other account of its sign-in
 * provider that holds them too loses them, so mail goes through `linked` alone.
 */
export const scopesHandedOver = (provider: PersonalMailProvider, linked: AccountRow, userAccounts: AccountRow[]) =>
  userAccounts
    .filter((account) => account.id !== linked.id && account.providerId === linked.providerId && holds(account.scope, provider.scopes))
    .map((account) => ({ id: account.id, scope: storedScopes(account.scope).filter((scope) => !provider.scopes.includes(scope)).join(',') || null }))

/**
 * Better Auth's `databaseHooks.account`: an account written by a link, whose OAuth state names the person it links to,
 * becomes the one mail goes through when it holds a mail provider's scopes (see `scopesHandedOver`); other writes read nothing. Only a link
 * writes an existing account's scopes: a sign-in or a token refresh rewrites its tokens and leaves its scopes as they
 * were, so signing in with an older account does not take the mail back to it.
 */
export const mailLinkHooks = (providers: PersonalMailProvider[]): AccountHooks => {
  const handOver: AfterWrite = async (account, context) => {
    const provider = mailProviderOf(providers, account)
    if (!context || !provider || !(await getOAuthState())?.link) return
    const adapter = context.context.internalAdapter
    // Each update runs this hook again, for an account that no longer holds the mail scopes: it hands nothing over.
    for (const { id, scope } of scopesHandedOver(provider, account, await adapter.findAccounts(account.userId))) await adapter.updateAccount(id, { scope })
  }
  return { create: { after: handOver }, update: { after: handOver } }
}
