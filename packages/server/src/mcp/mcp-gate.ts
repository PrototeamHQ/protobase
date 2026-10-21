import { getOAuthProtectedResourceMetadataUrl, OAuthError, OAuthErrorCode, requireBearerAuth, type AuthInfo } from '@modelcontextprotocol/server'
import { decodeJwt } from 'jose'
import { HttpProblem } from '../problem'
import type { Authenticator, Session } from '../types'

export type McpGateInput = {
  /** Verifies the request's MCP access token, its audience and any DPoP proof, such as `betterAuthAuthenticator(...).forAudience(resource)`. */
  authenticate: Authenticator
  /** The endpoint's URL, the audience its tokens carry. */
  resource: string
  /** The scope a token needs. */
  scope: string
}

// The SDK reads only the Bearer scheme; a DPoP-bound token is the same token, whose proof `authenticate` checks.
const bearerOnly = (request: Request) => {
  const authorization = request.headers.get('authorization')
  const headers = new Headers()
  if (authorization) headers.set('authorization', authorization.replace(/^DPoP /i, 'Bearer '))
  return new Request(request.url, { headers })
}

/**
 * Admits a request whose MCP access token `authenticate` verifies, with `scope`: resolves to its `AuthInfo`, carrying
 * the session (see `sessionOf`), or to the 401 or 403 answer whose challenge names the resource's metadata document.
 */
export const mcpGate = ({ authenticate, resource, scope }: McpGateInput) => {
  const resourceUrl = new URL(resource)
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resourceUrl)
  return async (request: Request): Promise<AuthInfo | Response> => {
    // The SDK answers any failure of the verifier, an unexpected one with a bare 500; that one is rethrown instead, for the app's error handler.
    let unexpected: { error: unknown } | undefined
    const verifier = {
      verifyAccessToken: async (token: string): Promise<AuthInfo> => {
        const session = await Promise.resolve(authenticate(request)).catch((error: unknown) => {
          if (error instanceof HttpProblem && error.status === 401) throw new OAuthError(OAuthErrorCode.InvalidToken, error.detail)
          unexpected = { error }
          throw error
        })
        if (!session.client) throw new OAuthError(OAuthErrorCode.InvalidToken, 'The token was not issued to an MCP client')
        return { token, clientId: session.client.id, scopes: session.client.scopes, expiresAt: decodeJwt(token).exp, resource: resourceUrl, extra: { session } }
      },
    }
    const answer = await requireBearerAuth({ verifier, requiredScopes: [scope], resourceMetadataUrl, expectedResource: resourceUrl })(bearerOnly(request))
    if (unexpected) throw unexpected.error
    return answer
  }
}

/** The session `mcpGate` admitted the request with. */
export const sessionOf = (authInfo: AuthInfo | undefined): Session => {
  const session = authInfo?.extra?.session
  if (!session) throw new Error('The MCP request carries no session')
  return session as Session
}
