import { cimd } from '@better-auth/cimd'
import { fetchClientMetadataResource } from '@better-auth/cimd/node'
import { mcp } from '@better-auth/mcp'
import type { RoleDefinitions } from '../organizations/role-definitions'
import type { AuthContext } from '../organizations/store'
import type { RoleSession } from '../roles/session-role'
import type { SignInPolicy } from '../sign-in-policy'
import { pluginNames } from '../snake-case-names'
import { mcpConsentCheck } from './consent-check'
import { mcpConnectedApps } from './connected-apps'
import { consentReference } from './consent-reference'
import { mcpAccessTokenSeconds, mcpScope, type ResolvedMcp } from './mcp-plugins'
import { mcpTokenClaims } from './mcp-token-claims'
import { mcpRefreshReuse } from './refresh-reuse'
import { mcpRequestDefaults } from './request-defaults'
import { mcpGrantRevocation } from './revoke-grants'
import { mcpSetupGate } from './setup-gate'
import { mcpSignedQueryGuard } from './signed-query-guard'

// The OAuth provider's plugins, apart from the MCP options so that `buildAuth` loads them only for an app with `mcp`.

export type McpAuthPluginsOptions = {
  mcp: ResolvedMcp
  /** Organizations are on. */
  organizations: boolean
  /** Mail can be sent, as the sign-in policy reads it. */
  mail: boolean
  /** The policy until an admin saves one, from `appSignInPolicy`. */
  defaultPolicy: SignInPolicy
  /** The roles with their labels, for the list of connected apps. */
  definitions: RoleDefinitions
  /** The auth context once the instance exists. */
  context: () => Promise<AuthContext>
}

/**
 * The Better Auth plugins of an OAuth provider for MCP clients, after the `jwt` plugin, in this order: the guard on
 * signed queries, the request defaults, the setup gate, the provider (`mcp()`), and client metadata documents
 * (`cimd()`), the revocation when the account is secured (`mcpGrantRevocation`) or a refresh token is reused
 * (`mcpRefreshReuse`), and the person's list of connected
 * apps, where they disconnect one (`mcpConnectedApps`). A client registers itself, the person signs in on the app's own pages and allows it on the connect
 * page, and the client gets 15-minute access tokens for the MCP resource only, with refresh tokens, carrying the role
 * and organization the person worked in when they allowed it.
 */
export const mcpAuthPlugins = ({ mcp: resolved, organizations, mail, defaultPolicy, definitions, context }: McpAuthPluginsOptions) => [
  mcpSignedQueryGuard(),
  mcpRequestDefaults(resolved.resource),
  mcpSetupGate({ mail, defaultPolicy, connectPage: resolved.connectPage }),
  mcp({
    resource: resolved.resource,
    loginPage: resolved.connectPage,
    consentPage: resolved.connectPage,
    scopes: [mcpScope, 'offline_access'],
    clientRegistrationDefaultScopes: [mcpScope, 'offline_access'],
    grantTypes: ['authorization_code', 'refresh_token'],
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    // Loopback and app-scheme callbacks (command-line tools, code editors) register without an application type; a sent one stands.
    clientRegistrationDefaultApplicationType: 'infer',
    postLogin: {
      page: resolved.connectPage,
      // The connect page resumes through `/oauth2/continue` itself, so the provider never redirects to it for this.
      shouldRedirect: () => false,
      consentReferenceId: async ({ user, session }) => consentReference(await context(), { user, session: session as RoleSession }),
    },
    customAccessTokenClaims: async ({ user, referenceId }) => mcpTokenClaims(await context(), { organizations, mail, defaultPolicy }, user, referenceId),
    accessTokenExpiresIn: mcpAccessTokenSeconds,
    extensions: [mcpConsentCheck()],
    schema: pluginNames.mcp,
  }),
  cimd({ fetchClientMetadataResource: resolved.fetchClientMetadata ?? fetchClientMetadataResource, metadataProfile: 'mcp-2026-07-28' }),
  mcpGrantRevocation(),
  mcpRefreshReuse(),
  mcpConnectedApps({ definitions }),
]
