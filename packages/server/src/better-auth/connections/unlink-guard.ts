import { createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { accountConnection } from './account-connection'
import { connectionRefusal } from './connection-refusal'
import type { ResolvedConnection } from './declared-connections'

/**
 * Better Auth's `/unlink-account` would delete an account without revoking its token or stopping the triggers on it,
 * so it refuses each account `GET /connections` lists: one of a provider only connections use, or a sign-in provider's
 * that holds a connection's scopes. Better Auth takes the account's own id among the session user's accounts; an id
 * not among them passes on to its own answer, the same for someone else's account as for none.
 */
export const unlinkGuard = (connections: readonly ResolvedConnection[]) => {
  const connectionOf = accountConnection(connections)
  return {
    matcher: (context: { path?: string }) => context.path === '/unlink-account',
    handler: createAuthMiddleware(async (ctx) => {
      const accountId = (ctx.body as { accountId?: unknown } | undefined)?.accountId
      const session = await getSessionFromCtx(ctx)
      // Without a session, or an account id, Better Auth's endpoint refuses the request itself.
      if (!session || typeof accountId !== 'string') return
      const account = (await ctx.context.internalAdapter.findAccounts(session.user.id)).find((candidate) => candidate.id === accountId)
      if (account && connectionOf(account)) throw connectionRefusal('FORBIDDEN', 'CONNECTION_UNLINK_REFUSED', ctx.headers)
    }),
  }
}
