import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint, createAuthMiddleware, sessionMiddleware } from 'better-auth/api'
import { decryptOAuthToken } from 'better-auth/oauth2'
import * as z from 'zod'
import { storedScopes } from '../../personal-mail/linked-accounts'
import { holdsScopes } from '../../workflows/connections/connection-provider'
import type { ConnectionEvents } from './connection-events'
import type { ResolvedConnection } from './declared-connections'
import { revokeToken } from './revoke-token'

export const connectionPaths = { list: '/connections', disconnect: '/connections/disconnect' }

export type ConnectionsPluginInput = { connections: readonly ResolvedConnection[]; events: ConnectionEvents; allowPrivateAddresses: boolean }

// The same answer for an account that is not there and one of someone else's, so it tells nothing of other accounts.
const notFound = () => new APIError('NOT_FOUND', { code: 'CONNECTION_NOT_FOUND', message: 'You have no connected account with this id.' })

/**
 * The signed-in person's connections: `GET /connections` lists each connection the app's workflow plugins declare with
 * the person's accounts that fit it, and whether a trigger waits for one to be signed in again, never a token.
 * `POST /connections/disconnect` revokes an account's token at its provider, then deletes it whatever the provider
 * answered, and stops the triggers on it; their own account only, and never the last way they sign in. Connecting is
 * Better Auth's `/link-social`; a sign-in (not a link) through a provider only connections use is refused.
 */
export const connectionsPlugin = ({ connections, events, allowPrivateAddresses }: ConnectionsPluginInput) => {
  const own = new Set(connections.filter(({ declaration }) => 'oauth' in declaration).map(({ providerId }) => providerId))
  return {
    id: 'protobase-connections',
    endpoints: {
      listConnections: createAuthEndpoint(connectionPaths.list, { method: 'GET', use: [sessionMiddleware] }, async (ctx) => {
        const accounts = await ctx.context.internalAdapter.findAccounts(ctx.context.session.user.id)
        const fitting = (connection: ResolvedConnection) => accounts.filter((account) => account.providerId === connection.providerId && holdsScopes(storedScopes(account.scope), connection.declaration))
        const waiting = new Set(await events.needsSignIn(connections.flatMap((connection) => fitting(connection).map((account) => account.id))))
        return ctx.json({
          connections: connections.map((connection) => ({
            key: connection.key,
            label: connection.declaration.label,
            provider: connection.providerId,
            scopes: connection.declaration.scopes ?? [],
            link_params: connection.declaration.link_params ?? {},
            accounts: fitting(connection).map((account) => ({ id: account.id, scopes: storedScopes(account.scope), created_at: account.createdAt, needs_sign_in: waiting.has(account.id) })),
          })),
        })
      }),
      disconnectConnection: createAuthEndpoint(connectionPaths.disconnect, { method: 'POST', use: [sessionMiddleware], body: z.object({ accountId: z.string() }) }, async (ctx) => {
        const adapter = ctx.context.internalAdapter
        const accounts = await adapter.findAccounts(ctx.context.session.user.id)
        const account = accounts.find((candidate) => candidate.id === ctx.body.accountId)
        const connection = account && connections.find((candidate) => candidate.providerId === account.providerId)
        if (!account || !connection) throw notFound()
        // As Better Auth's own unlinking: the last account is the person's only way to sign in.
        if (accounts.length === 1) throw new APIError('BAD_REQUEST', { code: 'FAILED_TO_UNLINK_LAST_ACCOUNT', message: 'This is your only way to sign in: add another before you disconnect it.' })
        const stored = account.refreshToken ?? account.accessToken
        const token = stored ? await decryptOAuthToken(stored, ctx.context) : undefined
        let revoked = false
        try {
          if (connection.revocationUrl && token) revoked = await revokeToken({ url: connection.revocationUrl, client: connection.client, token, hint: account.refreshToken ? 'refresh_token' : 'access_token', allowPrivateAddresses })
        } finally {
          // Deleted whatever the provider did, so no later step can use the token.
          await adapter.deleteAccount(account.id)
          await events.disconnected(account.id)
        }
        return ctx.json({ disconnected: true, revoked })
      }),
    },
    hooks: {
      before: [
        {
          matcher: (context) => context.path === '/sign-in/social',
          handler: createAuthMiddleware(async (ctx) => {
            const provider = (ctx.body as { provider?: unknown } | undefined)?.provider
            if (typeof provider === 'string' && own.has(provider)) throw new APIError('FORBIDDEN', { code: 'CONNECTION_NOT_SIGN_IN', message: 'This provider connects an account to a workflow; it does not sign in.' })
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin
}
