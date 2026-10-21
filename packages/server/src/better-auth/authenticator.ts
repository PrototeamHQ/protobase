import { jwtSessions, type JwtVerifyOptions } from '../auth/jwt'
import type { Authenticator, TenantValue } from '../types'
import { withTrustedApps, type TrustedApp } from './app-tokens'
import type { AdminAuth } from './create-auth'
import { cachedKeys, type JwksCacheOptions } from './jwks-cache'
import { noGlobalRole } from './organizations/role-definitions'
import type { AuthContext } from './organizations/store'
import { checkTokenStanding, tokenClaims } from './token-standing'

export type BetterAuthAuthenticatorOptions = {
  /** The Better Auth instance of this process: keys are read from it directly, no HTTP round trip. */
  auth?: AdminAuth
  /** Or its JWKS endpoint, for an API that runs apart from the auth server. Needs `issuer`. */
  jwksUrl?: string | URL
  /** Defaults to the auth instance's `issuer`, its `baseURL`; it is both issuer and audience of its tokens. */
  issuer?: string
  /** The one tenant everyone works in, for an app without organizations; never read from the token. */
  tenant?: TenantValue | (() => Promise<TenantValue | undefined>)
  /** Whether the tokens carry organizations; read from `auth` when given. Needed with `jwksUrl` only. */
  organizations?: boolean
  /** How long the key set is cached; see `cachedKeys`. */
  cache?: JwksCacheOptions
  /** Other Protobase apps whose users this API admits with their own tokens, so their admin apps can draw its resources (see `TrustedApp`). */
  apps?: TrustedApp[]
}

/** How the tokens of this Better Auth instance verify: its key set, and its issuer as both issuer and audience. */
export const betterAuthTokens = (options: Pick<BetterAuthAuthenticatorOptions, 'auth' | 'jwksUrl' | 'issuer' | 'cache'>): JwtVerifyOptions & { issuer: string } => {
  const issuer = options.issuer ?? options.auth?.issuer
  if (!issuer) throw new Error('betterAuthAuthenticator needs `issuer` (or an `auth` instance with a baseURL)')
  if (!options.auth && !options.jwksUrl) throw new Error('betterAuthAuthenticator needs `auth` or `jwksUrl`')
  return { ...(options.auth ? { keys: cachedKeys(() => options.auth!.api.getJwks(), options.cache) } : { jwksUrl: options.jwksUrl! }), issuer, audience: issuer }
}

/**
 * Verifies the bearer JWT that Better Auth's jwt plugin issues. `sub` is the user id, the `role` claim (a comma
 * separated string from the admin plugin) becomes `roles`. With organizations, the `org` claim is the tenant and the
 * organization, and the membership's `app_roles` are added to the global roles; `user`, which stands for no global
 * role, is left out. With `auth`, every request also reads the store to check that the token still stands
 * (`checkTokenStanding`), so a ban, a lowered role, a deleted user or a sign-out ends it at once; with `jwksUrl` alone
 * a token works until it expires. With `apps`, the tokens of those apps are admitted too, with the roles each gives
 * its users here.
 */
export const betterAuthAuthenticator = (options: BetterAuthAuthenticatorOptions): Authenticator => {
  const tokens = betterAuthTokens(options)
  const { issuer } = tokens
  const organizations = options.organizations ?? Boolean(options.auth?.organizations)
  const sessions = jwtSessions({
    ...tokens,
    rolesClaim: 'role',
    ...(organizations && { tenantClaim: 'org', extraRolesClaim: 'app_roles' }),
    ...(options.tenant !== undefined && { tenant: options.tenant }),
  })
  const { auth } = options
  const verify: Authenticator = async (request) => {
    const { payload, session } = await sessions(request)
    if (auth) await checkTokenStanding((await auth.$context) as unknown as AuthContext, tokenClaims(payload, session.user.roles, organizations ? session.tenant : undefined), organizations)
    return session
  }
  const own: Authenticator = !organizations
    ? verify
    : async (request) => {
        const session = await verify(request)
        const user = { ...session.user, roles: session.user.roles.filter((role) => role !== noGlobalRole) }
        return { ...session, user, ...(session.tenant !== undefined && { organization: { id: session.tenant } }) }
      }
  return withTrustedApps(own, issuer, options.apps ?? [])
}
