import type { ResolvedMcp } from './mcp/mcp-plugins'

/** The path of the app's API below its origin, which names it as an OAuth resource: `/api` and everything under it. */
export const apiResourcePath = '/api'

export type OAuthApiOptions = {
  /**
   * OAuth clients may ask for access tokens for the app's API (`resource=<origin>/api`), such as a native app that signs
   * in through the connect page, and the API takes them as `Authorization: Bearer <token>`. Off by default.
   */
  api?: boolean
}

/** The API as an OAuth resource: the audience of its tokens. */
export type OAuthApiResource = { resource: string }

const withoutSlash = (url: string) => url.replace(/\/+$/, '')

/**
 * The API's OAuth resource for an app at `baseURL` with `oauth.api`: the origin of `baseURL` with `/api`. It is never
 * the issuer, whose tokens the API takes without a grant check, nor the MCP resource, whose tokens MCP's own write
 * approval guards. It needs the provider `mcp` turns on.
 */
export const resolveOAuthApi = (baseURL: string, oauth: OAuthApiOptions | undefined, mcp: ResolvedMcp | undefined): OAuthApiResource | undefined => {
  if (oauth?.api !== true) return
  if (!mcp) throw new Error("auth.oauth.api needs auth.mcp, whose OAuth provider issues the API's tokens")
  const resource = `${new URL(baseURL).origin}${apiResourcePath}`
  if (resource === withoutSlash(baseURL)) throw new Error(`auth.oauth.api: the API's resource ${resource} is the app's url, whose own tokens the API takes; serve the app at its origin`)
  if (resource === mcp.resource) throw new Error(`auth.oauth.api: the API's resource ${resource} is the MCP endpoint's; give auth.mcp.path another path`)
  return { resource }
}
