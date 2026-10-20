import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'

// The provider resumes an authorization from a signed query (`oauth_query`) on any request that carries one and signs
// in. Only the connect page's own requests may: `continue` and `consent`, and `authorize`, which the provider calls
// again with the same body when the session cookie is refreshed on the way.
const signedQueryPaths = ['/oauth2/continue', '/oauth2/consent', '/oauth2/authorize']

/** Whether a request to `path` may carry a signed authorization query. */
export const isSignedQueryAllowed = (path: string | undefined) => path !== undefined && signedQueryPaths.includes(path)

const hasSignedQuery = (body: unknown) => typeof body === 'object' && body !== null && 'oauth_query' in body

/**
 * Refuses a signed authorization query on any other request (`400 OAUTH_QUERY_REFUSED`), so a sign-in by password,
 * emailed code, passkey, two-factor or provider never resumes an authorization on its own: the person goes on from
 * the connect page, which shows what they allow. Runs before the provider's own hook.
 */
export const mcpSignedQueryGuard = () =>
  ({
    id: 'protobase-mcp-signed-query-guard',
    hooks: {
      before: [
        {
          matcher: (context) => hasSignedQuery(context.body) && !isSignedQueryAllowed(context.path),
          handler: createAuthMiddleware(async () => {
            throw new APIError('BAD_REQUEST', { code: 'OAUTH_QUERY_REFUSED', message: 'Sign in first, then continue from the connect page.' })
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
