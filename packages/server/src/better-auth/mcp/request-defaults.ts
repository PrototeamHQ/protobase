import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'

type Params = Record<string, unknown>

const isParams = (value: unknown): value is Params => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The authorization parameters with `resource` set to the one this provider protects when none is sent. The provider
 * issues a JWT access token, and so runs the grant's token-time checks (`mcpTokenClaims`, `mcpConsentCheck`), only
 * for a token with an audience; without a resource it would issue an opaque token and a refresh token with no check.
 */
export const withResource = (params: Params, resource: string): Params => (params.resource === undefined ? { ...params, resource } : params)

/** `scope` with `offline_access` added, which refresh tokens need; the resource metadata leaves it out of its scopes. */
export const withOfflineAccess = (scope: string) => {
  const scopes = scope.split(' ').filter(Boolean)
  return scopes.includes('offline_access') ? scope : [...scopes, 'offline_access'].join(' ')
}

const withDefaults = (params: Params, resource: string) => {
  const defaulted = withResource(params, resource)
  return typeof defaulted.scope === 'string' ? { ...defaulted, scope: withOfflineAccess(defaulted.scope) } : defaulted
}

// Fields a client could register that make the server call or fetch a URL of the client's choosing later: back-channel
// logout, posted to when a session ends, and a key set fetched at the token endpoint. MCP clients use neither.
const refusedRegistrationFields = ['backchannel_logout_uri', 'backchannel_logout_session_required', 'jwks_uri']

/** The registration field this server refuses, when `body` has one. */
export const refusedRegistrationField = (body: unknown) => (isParams(body) ? refusedRegistrationFields.find((field) => body[field] !== undefined) : undefined)

/**
 * Before hooks that fill in what MCP clients leave out: on `authorize`, the resource and `offline_access` (in the
 * query, or the body of a form POST, wherever the parameters are); on `register`, refusing fields that would make the
 * server call a URL the client chose (`400 invalid_client_metadata`).
 */
export const mcpRequestDefaults = (resource: string) =>
  ({
    id: 'protobase-mcp-request-defaults',
    hooks: {
      before: [
        {
          matcher: (context) => context.path === '/oauth2/authorize',
          handler: createAuthMiddleware(async (ctx) => {
            // A form POST carries the parameters in its body; a GET, and the provider resuming from a signed query, in the query.
            const inBody = isParams(ctx.body) && 'client_id' in ctx.body
            if (inBody) return { context: { body: withDefaults(ctx.body as Params, resource) } }
            return { context: { query: withDefaults(isParams(ctx.query) ? ctx.query : {}, resource) } }
          }),
        },
        {
          matcher: (context) => context.path === '/oauth2/register',
          handler: createAuthMiddleware(async (ctx) => {
            const field = refusedRegistrationField(ctx.body)
            if (field) throw new APIError('BAD_REQUEST', { error: 'invalid_client_metadata', error_description: `This server does not take ${field}.` })
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
