import { cimd } from '@better-auth/cimd'
import { fetchClientMetadataResource } from '@better-auth/cimd/node'
import { mcp } from '@better-auth/mcp'
import type { ClientMetadataResourceFetch } from '@better-auth/oauth-provider'
import { connectRoute } from '@protobase/schema'
import type { AuthContext } from '../organizations/store'
import type { RoleSession } from '../roles/session-role'
import { pluginNames } from '../snake-case-names'
import { mcpConsentCheck } from './consent-check'
import { consentReference } from './consent-reference'
import { mcpTokenClaims } from './mcp-token-claims'
import { mcpRequestDefaults } from './request-defaults'
import { mcpSetupGate } from './setup-gate'
import { mcpSignedQueryGuard } from './signed-query-guard'

/** The path of the app's MCP endpoint, below its origin, unless `mcp.path` names another. */
export const defaultMcpPath = '/api/mcp'

/** The scope an MCP client asks for: acting as the person, with the role and organization they allowed it with. */
export const mcpScope = 'mcp'

/** How long an MCP access token works, in seconds: a ban, a policy or a role change stops a client within it. */
export const mcpAccessTokenSeconds = 15 * 60

export type McpAuthOptions = {
  /** The path of the MCP endpoint on the app's origin, its OAuth resource; default `/api/mcp`. Changing it makes clients connect again. */
  path?: string
  /** The connect page's path on the app's origin, where people sign in and allow a client; default `/-/connect`, for a UI at the root. */
  connectPage?: string
  /** Fetches a client's metadata document (a URL client id); default the CIMD plugin's Node transport, which refuses non-public addresses. */
  fetchClientMetadata?: ClientMetadataResourceFetch
}

/** `McpAuthOptions` with the defaults filled in and the resource worked out. */
export type ResolvedMcp = { path: string; connectPage: string; resource: string; fetchClientMetadata: ClientMetadataResourceFetch }

/** The OAuth resource of the MCP endpoint: the origin of `baseURL` with `path`. */
export const mcpResource = (baseURL: string, path: string) => `${new URL(baseURL).origin}${path}`

/**
 * The MCP options with their defaults, for an app at `baseURL`. The path must be one below the origin, so the
 * resource is never the issuer, in either of its forms, whose tokens the app's own API takes.
 */
export const resolveMcp = (baseURL: string, options: true | McpAuthOptions): ResolvedMcp => {
  const { path = defaultMcpPath, connectPage = connectRoute, fetchClientMetadata = fetchClientMetadataResource } = options === true ? {} : options
  if (!path.startsWith('/') || path.length < 2) throw new Error(`mcp.path "${path}" must be a path below the app's origin, such as ${defaultMcpPath}`)
  if (!connectPage.startsWith('/')) throw new Error(`mcp.connectPage "${connectPage}" must be a path on the app's origin, such as ${connectRoute}`)
  return { path, connectPage, resource: mcpResource(baseURL, path), fetchClientMetadata }
}

/**
 * The OAuth provider's endpoints MCP does not use, closed: managing clients (dynamic registration and client metadata
 * documents are the only ways in), OpenID Connect's userinfo and logout, and the provider's own consent endpoints,
 * whose `delete-consent` would leave the client's tokens working; the account page lists and disconnects clients.
 */
export const mcpUnusedPaths = [
  '/oauth2/create-client',
  '/oauth2/get-client',
  '/oauth2/get-clients',
  '/oauth2/update-client',
  '/oauth2/delete-client',
  '/oauth2/client/rotate-secret',
  '/oauth2/client/rotate-keys',
  '/oauth2/public-client-prelogin',
  '/oauth2/userinfo',
  '/oauth2/end-session',
  '/oauth2/end-session/confirm',
  '/oauth2/get-consent',
  '/oauth2/get-consents',
  '/oauth2/update-consent',
  '/oauth2/delete-consent',
]

export type McpAuthPluginsOptions = {
  mcp: ResolvedMcp
  /** Organizations are on. */
  organizations: boolean
  /** Mail can be sent, as the sign-in policy reads it. */
  mail: boolean
  /** The auth context once the instance exists. */
  context: () => Promise<AuthContext>
}

/**
 * The Better Auth plugins of an OAuth provider for MCP clients, after the `jwt` plugin, in this order: the guard on
 * signed queries, the request defaults, the setup gate, the provider (`mcp()`), and client metadata documents
 * (`cimd()`). A client registers itself, the person signs in on the app's own pages and allows it on the connect
 * page, and the client gets 15-minute access tokens for the MCP resource only, with refresh tokens, carrying the role
 * and organization the person worked in when they allowed it.
 */
export const mcpAuthPlugins = ({ mcp: resolved, organizations, mail, context }: McpAuthPluginsOptions) => [
  mcpSignedQueryGuard(),
  mcpRequestDefaults(resolved.resource),
  mcpSetupGate({ mail, connectPage: resolved.connectPage }),
  mcp({
    resource: resolved.resource,
    loginPage: resolved.connectPage,
    consentPage: resolved.connectPage,
    scopes: [mcpScope, 'offline_access'],
    clientRegistrationDefaultScopes: [mcpScope, 'offline_access'],
    grantTypes: ['authorization_code', 'refresh_token'],
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    // Loopback and app-scheme callbacks (Claude Code, Cursor) register without an application type; a sent one stands.
    clientRegistrationDefaultApplicationType: 'infer',
    postLogin: {
      page: resolved.connectPage,
      // The connect page resumes through `/oauth2/continue` itself, so the provider never redirects to it for this.
      shouldRedirect: () => false,
      consentReferenceId: async ({ user, session }) => consentReference(await context(), { user, session: session as RoleSession }),
    },
    customAccessTokenClaims: async ({ user, referenceId }) => mcpTokenClaims(await context(), { organizations, mail }, user, referenceId),
    accessTokenExpiresIn: mcpAccessTokenSeconds,
    extensions: [mcpConsentCheck()],
    schema: pluginNames.mcp,
  }),
  cimd({ fetchClientMetadataResource: resolved.fetchClientMetadata, metadataProfile: 'mcp-2026-07-28' }),
]
