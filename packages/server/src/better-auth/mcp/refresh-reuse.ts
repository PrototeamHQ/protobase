import type { BetterAuthPlugin, DBAdapter } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { base64url } from 'jose'
import { revokeMcpGrants } from './revoke-grants'

type Adapter = Pick<DBAdapter, 'findOne' | 'deleteMany'>
type RefreshRow = { id: string; userId: string; clientId: string }

const refreshModel = 'oauthRefreshToken'

/** The refresh token a request to the token or revocation endpoint presents, or `undefined`. */
export const presentedRefreshToken = (path: string | undefined, body: unknown) => {
  if (typeof body !== 'object' || body === null) return undefined
  const params = body as Record<string, unknown>
  if (path === '/oauth2/token' && params.grant_type === 'refresh_token' && typeof params.refresh_token === 'string') return params.refresh_token
  if (path === '/oauth2/revoke' && params.token_type_hint !== 'access_token' && typeof params.token === 'string') return params.token
  return undefined
}

// The provider stores a refresh token as its SHA-256 in unpadded base64url (its default `storeTokens`, which the MCP
// options keep).
const storedToken = async (token: string) => base64url.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))

/** The stored row of a refresh token, before the provider handles it. */
export const findRefreshToken = async (adapter: Adapter, token: string) =>
  (await adapter.findOne<RefreshRow>({ model: refreshModel, where: [{ field: 'token', value: await storedToken(token) }] })) ?? undefined

/**
 * Ends the grant after the provider took a refresh token for stolen: when a rotated one is presented again, it deletes
 * every refresh token of that client and person (`invalidateRefreshFamily`) but leaves the consent, so the access
 * tokens would still be taken. A row the request found before and that is gone after was deleted that way, so the
 * grant is revoked (`revokeMcpGrants`), and the client's access tokens stop at once (`checkMcpGrant`).
 */
export const endGrantIfFamilyInvalidated = async (adapter: Adapter, before: RefreshRow) => {
  if (await adapter.findOne({ model: refreshModel, where: [{ field: 'id', value: before.id }] })) return
  await revokeMcpGrants(adapter, before.userId, before.clientId)
}

/**
 * Hooks around the token and revocation endpoints that disconnect a client whose refresh token was reused
 * (`endGrantIfFamilyInvalidated`). A failure to read or delete is not caught: the request answers 500.
 */
export const mcpRefreshReuse = () => {
  // The refresh token each request found before the provider ran, by the request's context, which both hooks share.
  const found = new WeakMap<object, RefreshRow>()
  const matcher = (context: { path?: string; body?: unknown }) => presentedRefreshToken(context.path, context.body) !== undefined
  return {
    id: 'protobase-mcp-refresh-reuse',
    hooks: {
      before: [
        {
          matcher,
          handler: createAuthMiddleware(async (ctx) => {
            const row = await findRefreshToken(ctx.context.adapter, presentedRefreshToken(ctx.path, ctx.body)!)
            if (row) found.set(ctx.context, row)
          }),
        },
      ],
      after: [
        {
          matcher,
          handler: createAuthMiddleware(async (ctx) => {
            const row = found.get(ctx.context)
            if (row) await endGrantIfFamilyInvalidated(ctx.context.adapter, row)
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin
}
