import { connectRoute } from '@protobase/schema'
import type { ResolvedMcp } from '../mcp/mcp-plugins'
import { signInTokenSeconds } from '../sign-in-token'

export type OpenIdProviderOptions = {
  /** The connect page's path on the app's origin, where people sign in on the way to a client; default `/-/connect`, for a UI at the root. */
  connectPage?: string
}

/** `OpenIdProviderOptions` with the defaults filled in. */
export type ResolvedOpenIdProvider = { connectPage: string }

/** The scopes a client gets: who the person is, by `sub`, `email` and `email_verified`, and `name`. */
export const openIdScopes = ['openid', 'email', 'profile']

/** The grant of RFC 8693 a client the operator lets exchange tokens uses at the token endpoint. */
export const tokenExchangeGrant = 'urn:ietf:params:oauth:grant-type:token-exchange'

/**
 * How long an ID token lives, in seconds: as long as another Protobase app's token sign-in takes one
 * (`signInTokenSeconds`), so every ID token this provider issues signs in there.
 */
export const idTokenSeconds = signInTokenSeconds

/** How long an access token from this provider works, in seconds: what the client exchanges for ID tokens. */
export const accessTokenSeconds = 15 * 60

/**
 * The OpenID provider's options with their defaults. It cannot be on together with `mcp`, whose clients register
 * themselves: the one OAuth provider of an app would then hand an address to a client the operator never registered.
 */
export const resolveOpenIdProvider = (options: true | OpenIdProviderOptions, mcp: ResolvedMcp | undefined): ResolvedOpenIdProvider => {
  if (mcp) throw new Error('auth.openIdProvider cannot be on together with auth.mcp, whose clients register themselves; serve them from separate apps')
  const { connectPage = connectRoute } = options === true ? {} : options
  if (!connectPage.startsWith('/')) throw new Error(`auth.openIdProvider.connectPage "${connectPage}" must be a path on the app's origin, such as ${connectRoute}`)
  return { connectPage }
}

/**
 * The OAuth provider's endpoints an OpenID provider does not use, closed: registration (the operator registers every
 * client), the provider's own client management (`operatorClientsPlugin` replaces it), consent (no client is asked
 * for), userinfo and introspection (the ID token says who the person is), logout, and keys rotation.
 */
export const openIdUnusedPaths = [
  '/oauth2/register',
  '/oauth2/create-client',
  '/oauth2/get-client',
  '/oauth2/get-clients',
  '/oauth2/update-client',
  '/oauth2/delete-client',
  '/oauth2/client/rotate-secret',
  '/oauth2/client/rotate-keys',
  '/oauth2/public-client',
  '/oauth2/public-client-prelogin',
  '/oauth2/consent',
  '/oauth2/get-consent',
  '/oauth2/get-consents',
  '/oauth2/update-consent',
  '/oauth2/delete-consent',
  '/oauth2/userinfo',
  '/oauth2/introspect',
  '/oauth2/end-session',
  '/oauth2/end-session/confirm',
]
