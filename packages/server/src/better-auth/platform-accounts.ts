import type { BetterAuthOptions, BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
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
 * Auth finds the person by the provider and subject alone. Two first sign-ins with two subjects at the same moment can
 * both pass the check before either is written, so each looks again once written, and one that finds another account
 * of the provider removes its own and is refused: at most one stays, and when both look late, neither does.
 */
export const oneAccountPerProvider = (providers: string[]): AccountHooks => ({
  create: {
    before: async (account, context) => {
      if (!context || !providers.includes(account.providerId)) return
      const linked = await context.context.internalAdapter.findAccounts(account.userId)
      if (holdsOtherSubject(linked, account)) throw new APIError('FORBIDDEN', otherSubjectLinked)
    },
    after: async (account, context) => {
      if (!context || !providers.includes(account.providerId)) return
      const linked = await context.context.internalAdapter.findAccounts(account.userId)
      if (!holdsOtherSubject(linked, account)) return
      await context.context.internalAdapter.deleteAccount(account.id)
      throw new APIError('FORBIDDEN', otherSubjectLinked)
    },
  },
})

/** Whether a request to `path` connects an account of one of `providers` from the account page. */
export const connectsHiddenAccount = (path: string | undefined, body: unknown, providers: string[]) =>
  path === '/link-social' && typeof body === 'object' && body !== null && providers.includes((body as { provider?: unknown }).provider as string)

/** Whether `accountId`, which a request to disconnect names, is one of the person's accounts of one of `providers`. */
export const disconnectsHiddenAccount = (linked: { id: string; providerId: string }[], accountId: unknown, providers: string[]) =>
  linked.some((account) => account.id === accountId && providers.includes(account.providerId))

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
          matcher: (context) => connectsHiddenAccount(context.path, context.body, providers),
          handler: createAuthMiddleware(async () => {
            throw new APIError('FORBIDDEN', hiddenAccount)
          }),
        },
        {
          // Disconnecting names the account by its own id alone, so its provider is read from the person's accounts.
          matcher: (context) => context.path === '/unlink-account',
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx)
            // Without a session the endpoint's own check answers.
            if (!session) return
            const linked = await ctx.context.internalAdapter.findAccounts(session.user.id)
            if (disconnectsHiddenAccount(linked, (ctx.body as { accountId?: unknown } | undefined)?.accountId, providers)) throw new APIError('FORBIDDEN', hiddenAccount)
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
