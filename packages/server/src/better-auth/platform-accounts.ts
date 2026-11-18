import type { BetterAuthOptions, BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { ownAccount } from './platform-devices'
import type { SignInRefusal } from './sign-in-enforcement'

type AccountHooks = NonNullable<NonNullable<BetterAuthOptions['databaseHooks']>['account']>

export const hiddenAccount: SignInRefusal = { code: 'PROVIDER_ACCOUNT_HIDDEN', message: 'This sign-in provider is not connected or disconnected from the account page.' }

export const otherSubjectLinked: SignInRefusal = { code: 'PROVIDER_ACCOUNT_LINKED', message: 'This account is linked to another account at this provider already.' }

type Stores = { adapter: { count: (input: { model: string; where: { field: string; value: string; operator?: 'ne' }[] }) => Promise<number> } }

/** Whether the person holds an account of `providerId` other than `accountId`: one count, which the accounts' index serves. */
export const holdsOtherSubject = async ({ adapter }: Stores, { userId, providerId, accountId }: { userId: string; providerId: string; accountId: string }) =>
  (await adapter.count({ model: 'account', where: [{ field: 'userId', value: userId }, { field: 'providerId', value: providerId }, { field: 'accountId', operator: 'ne', value: accountId }] })) > 0

/**
 * The account's field that holds its person's id when the provider links one account per person, and nothing
 * otherwise: the store keeps it unique per provider (auth store migration 11), so a second account of such a provider
 * for one person is never written, also when two sign-ins write theirs at the same moment.
 */
export const singleSubjectField = 'singleSubjectUserId'

/**
 * Better Auth's `databaseHooks.account` for the platform's `providers`: a person holds at most one account of each, so
 * a first sign-in that Better Auth would link by the address to someone linked to another subject of that provider is
 * refused (`403 PROVIDER_ACCOUNT_LINKED`), as is connecting a second one from the account page. Once linked, Better
 * Auth finds the person by the provider and subject alone. Two first sign-ins with two subjects at the same moment can
 * both pass the check before either is written; the account's `singleSubjectField` then makes the store refuse the
 * second insert, so it links nothing and signs nobody in.
 */
export const oneAccountPerProvider = (providers: string[]): AccountHooks => ({
  create: {
    before: async (account, context) => {
      if (!providers.includes(account.providerId)) return
      if (context && (await holdsOtherSubject(context.context, account))) throw new APIError('FORBIDDEN', otherSubjectLinked)
      return { data: { singleSubjectUserId: account.userId } }
    },
  },
})

/** Whether a request to `path` connects an account of one of `providers` from the account page. */
export const connectsHiddenAccount = (path: string | undefined, body: unknown, providers: string[]) =>
  path === '/link-social' && typeof body === 'object' && body !== null && providers.includes((body as { provider?: unknown }).provider as string)

/** Whether the account a request to disconnect names, found among the person's own, is of one of `providers`. */
export const disconnectsHiddenAccount = (account: { providerId: string } | null, providers: string[]) => account !== null && providers.includes(account.providerId)

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
            const account = await ownAccount(ctx.context, session.user.id, (ctx.body as { accountId?: unknown } | undefined)?.accountId)
            if (disconnectsHiddenAccount(account, providers)) throw new APIError('FORBIDDEN', hiddenAccount)
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
