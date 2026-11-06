import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { storedScopes } from '../../personal-mail/linked-accounts'
import { holdsScopes } from '../../workflows/connections/connection-provider'
import type { ResolvedConnection } from './declared-connections'

const refused = () => new APIError('FORBIDDEN', { code: 'CONNECTION_UNLINK_REFUSED', message: 'This account is connected to workflows: disconnect it under Connections.' })

/**
 * Better Auth's `/unlink-account` would delete an account without revoking its token or stopping the triggers on it,
 * so it refuses each account `GET /connections` lists: one of a provider only connections use, or a sign-in provider's
 * that holds a connection's scopes. Better Auth takes the account's own id among the session user's accounts; an id
 * not among them passes on to its own answer, the same for someone else's account as for none.
 */
export const unlinkGuard = (connections: readonly ResolvedConnection[]) => {
  const own = new Set(connections.filter(({ declaration }) => 'oauth' in declaration).map(({ providerId }) => providerId))
  const connected = (account: { providerId: string; scope?: string | null }) =>
    own.has(account.providerId) || connections.some((connection) => connection.providerId === account.providerId && holdsScopes(storedScopes(account.scope), connection.declaration))
  return {
    matcher: (context: { path?: string }) => context.path === '/unlink-account',
    handler: createAuthMiddleware(async (ctx) => {
      const accountId = (ctx.body as { accountId?: unknown } | undefined)?.accountId
      const session = await getSessionFromCtx(ctx)
      // Without a session, or an account id, Better Auth's endpoint refuses the request itself.
      if (!session || typeof accountId !== 'string') return
      const account = (await ctx.context.internalAdapter.findAccounts(session.user.id)).find((candidate) => candidate.id === accountId)
      if (account && connected(account)) throw refused()
    }),
  }
}
