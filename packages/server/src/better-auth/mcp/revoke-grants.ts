import type { BetterAuthPlugin, DBAdapter } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { consentModel } from './consent-check'

type Adapter = Pick<DBAdapter, 'deleteMany'>

/**
 * Disconnects the user's MCP clients, or only `clientId`: deletes their consents, then their access tokens and refresh
 * tokens. Without the consent no code or refresh is exchanged any more (`mcpConsentCheck`), and authorize asks the
 * person again; access tokens already issued work out their 15 minutes. Access tokens go before refresh tokens, as the
 * provider's own revocation does, since an access token's row may name its refresh token.
 */
export const revokeMcpGrants = async (adapter: Adapter, userId: string, clientId?: string) => {
  const where = [{ field: 'userId', value: userId }, ...(clientId === undefined ? [] : [{ field: 'clientId', value: clientId }])]
  await adapter.deleteMany({ model: consentModel, where })
  await adapter.deleteMany({ model: 'oauthAccessToken', where })
  await adapter.deleteMany({ model: 'oauthRefreshToken', where })
}

/** A finished request to Better Auth, as an after hook sees it. */
export type FinishedRequest = {
  path?: string
  body?: unknown
  context: { session?: { user: { id: string } } | null; returned?: unknown }
}

// Ending all of the person's sessions from one of their own: everywhere, the other devices, or with a new password.
const ownPaths = ['/revoke-sessions', '/revoke-other-sessions']
// An admin securing someone else's account: ending their sessions, banning them, or setting their password.
const adminPaths = ['/admin/revoke-user-sessions', '/admin/ban-user', '/admin/set-user-password']

const bodyOf = (request: FinishedRequest) => (typeof request.body === 'object' && request.body !== null ? (request.body as Record<string, unknown>) : {})

// An update that bans the user or marks their address unverified, whatever the value's type: only `banned: false` and
// `emailVerified: true` leave the grants, so a value the store coerces cannot slip a ban past the revocation.
const securesAccount = (data: unknown) => {
  if (typeof data !== 'object' || data === null) return false
  const changes = data as Record<string, unknown>
  return ('banned' in changes && changes.banned !== false) || ('emailVerified' in changes && changes.emailVerified !== true)
}

/**
 * The user whose MCP grants a finished request ends, or `undefined`: the person who signed out everywhere, signed out
 * their other devices, or changed their password signing out the other devices; the user an admin ended the sessions
 * of, banned, set the password of, or marked unverified. Nobody when the request failed.
 */
export const grantOwnerToRevoke = (request: FinishedRequest) => {
  const { path, context } = request
  if (context.returned instanceof Error || path === undefined) return undefined
  const body = bodyOf(request)
  if (ownPaths.includes(path) || (path === '/change-password' && body.revokeOtherSessions === true)) return context.session?.user.id
  if (adminPaths.includes(path) || (path === '/admin/update-user' && securesAccount(body.data))) return body.userId === undefined ? undefined : String(body.userId)
  return undefined
}

/**
 * Disconnects the user's MCP clients after a request that secures their account (`grantOwnerToRevoke`). A failure to
 * delete is not caught: the request answers 500 after its own work, and can be run again.
 */
export const mcpGrantRevocation = () =>
  ({
    id: 'protobase-mcp-grant-revocation',
    hooks: {
      after: [
        {
          matcher: (context) => context.path !== undefined && [...ownPaths, ...adminPaths, '/change-password', '/admin/update-user'].includes(context.path),
          handler: createAuthMiddleware(async (ctx) => {
            const userId = grantOwnerToRevoke(ctx as FinishedRequest)
            if (userId) await revokeMcpGrants(ctx.context.adapter, userId)
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
