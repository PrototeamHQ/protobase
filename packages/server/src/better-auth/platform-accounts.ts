import type { BetterAuthOptions, BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import type { SignInRefusal } from './sign-in-enforcement'

type AccountHooks = NonNullable<NonNullable<BetterAuthOptions['databaseHooks']>['account']>

export const hiddenAccount: SignInRefusal = { code: 'PROVIDER_ACCOUNT_HIDDEN', message: 'This sign-in provider is not connected or disconnected from the account page.' }

export const otherSubjectLinked: SignInRefusal = { code: 'PROVIDER_ACCOUNT_LINKED', message: 'This account is linked to another account at this provider already.' }

/** Whether `linked`, a person's accounts, hold one of `providerId` other than `accountId`. */
export const holdsOtherSubject = (linked: { providerId: string; accountId: string }[], { providerId, accountId }: { providerId: string; accountId: string }) =>
  linked.some((account) => account.providerId === providerId && account.accountId !== accountId)

/**
 * Better Auth's `databaseHooks.account` for the platform's `providers`: a person holds at most one account of each, so
 * a first sign-in that Better Auth would link by the address to someone linked to another subject of that provider is
 * refused (`403 PROVIDER_ACCOUNT_LINKED`), as is connecting a second one from the account page. Once linked, Better
 * Auth finds the person by the provider and subject alone.
 */
export const oneAccountPerProvider = (providers: string[]): AccountHooks => ({
  create: {
    before: async (account, context) => {
      if (!context || !providers.includes(account.providerId)) return
      const linked = await context.context.internalAdapter.findAccounts(account.userId)
      if (holdsOtherSubject(linked, account)) throw new APIError('FORBIDDEN', otherSubjectLinked)
    },
  },
})

// What a person's request names the provider of an account by: connecting it, and disconnecting it.
const accountPaths: Record<string, 'provider' | 'providerId'> = { '/link-social': 'provider', '/unlink-account': 'providerId' }

/** Whether a request to `path` connects or disconnects an account of one of `providers` from the account page. */
export const changesHiddenAccount = (path: string | undefined, body: unknown, providers: string[]) => {
  const field = path === undefined ? undefined : accountPaths[path]
  if (!field || typeof body !== 'object' || body === null) return false
  return providers.includes((body as Record<string, unknown>)[field] as string)
}

// `/list-accounts` answers the accounts as they are, or `ctx.json` of them as a hook returned it.
const listedAccounts = (returned: unknown) => {
  const answer = (returned as { _flag?: unknown; body?: unknown } | null | undefined)?._flag === 'json' ? (returned as { body: unknown }).body : returned
  return Array.isArray(answer) ? (answer as { providerId?: unknown }[]) : undefined
}

/**
 * Keeps people's accounts of the platform's hidden `providers` (`PlatformSignIn.hidden`) off their account page:
 * `/list-accounts` leaves them out, and connecting or disconnecting one answers `403 PROVIDER_ACCOUNT_HIDDEN`. Signing
 * in with one stays, and deleting the person deletes them.
 */
export const hiddenAccountsPlugin = (providers: string[]) =>
  ({
    id: 'protobase-hidden-accounts',
    hooks: {
      before: [
        {
          matcher: (context) => changesHiddenAccount(context.path, context.body, providers),
          handler: createAuthMiddleware(async () => {
            throw new APIError('FORBIDDEN', hiddenAccount)
          }),
        },
      ],
      after: [
        {
          matcher: (context) => context.path === '/list-accounts',
          handler: createAuthMiddleware(async (ctx) => {
            const accounts = listedAccounts(ctx.context.returned)
            if (!accounts) return
            return ctx.json(accounts.filter(({ providerId }) => !providers.includes(providerId as string)))
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
