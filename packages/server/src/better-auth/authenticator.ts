import { createDpopReplayStore, createInMemoryDpopReplayStore, type DpopReplayStore } from 'better-auth/oauth2'
import type { JWTPayload } from 'jose'
import { jwtSessions, type JwtOptions, type JwtVerifyOptions } from '../auth/jwt'
import type { Authenticator, Session, TenantValue } from '../types'
import { withTrustedApps, type TrustedApp } from './app-tokens'
import type { AdminAuth } from './create-auth'
import { cachedKeys, type JwksCacheOptions } from './jwks-cache'
import { checkMcpGrant } from './mcp/grant-standing'
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
  /** The audience the tokens must name; default `issuer`, the app's own tokens. */
  audience?: string
}

/**
 * Verifies the app's tokens, and with `forAudience` the OAuth access tokens it issues for another audience, such as
 * its MCP endpoint (`auth.mcp.resource`).
 */
export type BetterAuthAuthenticator = Authenticator & {
  /**
   * An authenticator for the OAuth access tokens issued for `audience` alone: the app's keys, a `typ` of `at+jwt`, and
   * proof of the key for a DPoP-bound token, checked against `audience` as the URL it guards (the endpoint must answer
   * at exactly that URL). The app's own tokens and trusted apps' are refused; the session keeps the token's `client`.
   * With `auth`, every request also reads the store to check that the person still allows the client
   * (`checkMcpGrant`), so a disconnected client or a secured account ends its tokens at once. With `jwksUrl` instead of
   * `auth`, a token works until it expires, and a DPoP proof's single use holds in this process only.
   */
  forAudience: (audience: string) => Authenticator
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
export const betterAuthAuthenticator = (options: BetterAuthAuthenticatorOptions): BetterAuthAuthenticator => {
  const tokens = betterAuthTokens(options)
  const { issuer } = tokens
  const organizations = options.organizations ?? Boolean(options.auth?.organizations)
  const { auth } = options

  // The app's claims as a session, for its own tokens and those of another audience alike; with `auth`, also whether
  // the token still stands, as `standing` reads it from the store.
  type Standing = (context: AuthContext, payload: JWTPayload, session: Session) => Promise<Session['signIn'] | void>
  const sessionOf = (verifyOptions: Partial<JwtOptions>, standing: Standing): Authenticator => {
    const sessions = jwtSessions({
      ...tokens,
      rolesClaim: 'role',
      ...(organizations && { tenantClaim: 'org', extraRolesClaim: 'app_roles' }),
      ...(options.tenant !== undefined && { tenant: options.tenant }),
      ...verifyOptions,
    })
    const verify: Authenticator = async (request) => {
      const { payload, session } = await sessions(request)
      if (!auth) return session
      const signIn = await standing((await auth.$context) as unknown as AuthContext, payload, session)
      return signIn ? { ...session, signIn } : session
    }
    if (!organizations) return verify
    return async (request) => {
      const session = await verify(request)
      const user = { ...session.user, roles: session.user.roles.filter((role) => role !== noGlobalRole) }
      return { ...session, user, ...(session.tenant !== undefined && { organization: { id: session.tenant } }) }
    }
  }

  // Each DPoP proof is reserved once: in the auth store, shared by every instance, or with only a JWKS URL in this process.
  let replayStore: Promise<DpopReplayStore> | undefined
  const dpopReplayStore = () =>
    (replayStore ??= options.auth ? options.auth.$context.then(({ internalAdapter }) => createDpopReplayStore(internalAdapter)) : Promise.resolve(createInMemoryDpopReplayStore()))

  const ownStanding: Standing = (context, payload, session) =>
    checkTokenStanding(context, tokenClaims(payload, session.user.roles, organizations ? session.tenant : undefined), organizations)
  const own = sessionOf({ audience: options.audience ?? issuer }, ownStanding)
  // An access token's `sid` names the browser session that allowed the client, which may end long before the grant
  // does; revoking the grant ends its tokens instead (`revokeMcpGrants`), which the grant check sees.
  const grantStanding: Standing = async (context, payload, session) => {
    await checkMcpGrant(context.adapter, { userId: payload.sub!, clientId: session.client?.id, issuedAt: payload.iat })
  }
  return Object.assign(withTrustedApps(own, issuer, options.apps ?? []), {
    forAudience: (audience: string) => sessionOf({ audience, typ: 'at+jwt', dpop: { url: audience, replayStore: dpopReplayStore }, oauthClient: true }, grantStanding),
  })
}
