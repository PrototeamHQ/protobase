import { jwtAuthenticator } from '../auth/jwt'
import type { Authenticator, TenantValue } from '../types'
import type { AdminAuth } from './create-auth'
import { cachedKeys, type JwksCacheOptions } from './jwks-cache'

export type BetterAuthAuthenticatorOptions = {
  /** The Better Auth instance of this process: keys are read from it directly, no HTTP round trip. */
  auth?: AdminAuth
  /** Or its JWKS endpoint, for an API that runs apart from the auth server. Needs `issuer`. */
  jwksUrl?: string | URL
  /** Defaults to the auth instance's `baseURL`; it is both issuer and audience of its tokens. */
  issuer?: string
  /** The one tenant everyone works in (organizations are not used yet); never read from the token. */
  tenant?: TenantValue | (() => Promise<TenantValue | undefined>)
  /** How long the key set is cached; see `cachedKeys`. */
  cache?: JwksCacheOptions
}

/**
 * Verifies the bearer JWT that Better Auth's jwt plugin issues. `sub` is the user id, the `role` claim
 * (a comma separated string from the admin plugin) becomes `roles`.
 */
export const betterAuthAuthenticator = (options: BetterAuthAuthenticatorOptions): Authenticator => {
  const issuer = options.issuer ?? options.auth?.options.baseURL
  if (!issuer) throw new Error('betterAuthAuthenticator needs `issuer` (or an `auth` instance with a baseURL)')
  if (!options.auth && !options.jwksUrl) throw new Error('betterAuthAuthenticator needs `auth` or `jwksUrl`')
  return jwtAuthenticator({
    ...(options.auth ? { keys: cachedKeys(() => options.auth!.api.getJwks(), options.cache) } : { jwksUrl: options.jwksUrl! }),
    issuer,
    audience: issuer,
    rolesClaim: 'role',
    ...(options.tenant !== undefined && { tenant: options.tenant }),
  })
}
