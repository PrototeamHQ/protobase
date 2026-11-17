import { oauthProvider } from '@better-auth/oauth-provider'
import { mcpSetupGate } from '../mcp/setup-gate'
import { mcpSignedQueryGuard } from '../mcp/signed-query-guard'
import type { SignInPolicy } from '../sign-in-policy'
import { pluginNames } from '../snake-case-names'
import { grantSubjectsPlugin } from './grant-subjects'
import { idTokenClaims } from './id-token-claims'
import { operatorClientsOnly, operatorClientsPlugin } from './operator-clients'
import { accessTokenSeconds, idTokenSeconds, openIdScopes, tokenExchangeGrant, type ResolvedOpenIdProvider } from './openid-provider-options'
import { tokenExchange } from './token-exchange'

export type OpenIdProviderPluginsOptions = {
  openId: ResolvedOpenIdProvider
  /** Mail can be sent, as the sign-in policy reads it. */
  mail: boolean
  /** The policy until an admin saves one, from `appSignInPolicy`. */
  defaultPolicy: SignInPolicy
}

/** A redirect URI the client registered, character for character: no other port, path or case. */
export const exactRedirectUri = (uri: string, registered: readonly string[]) => registered.includes(uri)

/**
 * The Better Auth plugins of an OpenID provider for the operator's clients, after the `jwt` plugin, in this order: the
 * guard on signed queries, the setup gate, the refusal of every client the operator did not register, the provider,
 * and the operator's client API, with `grantSubjectsPlugin` last when `subject` is `grant`. A client gets the person's
 * `sub` (their id here, or its grant's subject), `email`, `email_verified` and
 * `name` in an ID token for its own client id, living `idTokenSeconds`, after the person signs in on the app's own
 * pages; it is never asked to allow the client. A client the operator lets exchange also gets refresh tokens, and ID
 * tokens for other clients, and for the origins of `audiences`, through the token exchange.
 */
export const openIdProviderPlugins = ({ openId, mail, defaultPolicy }: OpenIdProviderPluginsOptions) => [
  mcpSignedQueryGuard(),
  mcpSetupGate({ mail, defaultPolicy, connectPage: openId.connectPage }),
  operatorClientsOnly(openId.audiences),
  oauthProvider({
    loginPage: openId.connectPage,
    consentPage: openId.connectPage,
    scopes: [...openIdScopes, 'offline_access'],
    grantTypes: ['authorization_code', 'refresh_token', tokenExchangeGrant],
    allowDynamicClientRegistration: false,
    validateRedirectUri: exactRedirectUri,
    idTokenExpiresIn: idTokenSeconds,
    accessTokenExpiresIn: accessTokenSeconds,
    customIdTokenClaims: idTokenClaims,
    postLogin: {
      page: openId.connectPage,
      // The connect page resumes through `/oauth2/continue` itself, so the provider never redirects to it for this.
      shouldRedirect: () => false,
      consentReferenceId: () => undefined,
    },
    extensions: [tokenExchange(openId.audiences, openId.subject)],
    schema: pluginNames.mcp,
  }),
  operatorClientsPlugin(openId.audiences),
  ...(openId.subject === 'grant' ? [grantSubjectsPlugin()] : []),
]
