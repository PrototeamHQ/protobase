import { createDpopReplayStore, createInMemoryDpopReplayStore, type DpopReplayStore } from 'better-auth/oauth2'
import type { JWTPayload } from 'jose'
import { jwtSessions, type JwtOptions, type JwtVerifyOptions } from '../auth/jwt'
import type { Authenticator, Membership, Session, TenantValue } from '../types'
import { accessTokenType, withAccessTokens } from './api-access-tokens'
import { withTrustedApps, type TrustedApp } from './app-tokens'
import type { AdminAuth } from './create-auth'
import { cachedKeys, type JwksCacheOptions } from './jwks-cache'
import { checkMcpGrant } from './mcp/grant-standing'
import { mcpScope } from './mcp/mcp-plugins'
import { noGlobalRole } from './organizations/role-definitions'
import { sessionMemberships } from './organizations/session-memberships'
import type { AuthContext, OrganizationRole } from './organizations/store'
import { personalAccessTokenOf, personalAccessTokenSessions } from './personal-access-tokens/token-sessions'
import { checkTokenStanding, checkUserStanding, tokenClaims } from './token-standing'

/** The client id of a personal access token at the MCP endpoint, where every request comes from a client. */
export const personalAccessTokenClient = (id: string) => `personal-access-token:${id}`

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
   * (`checkMcpGrant`), and that they exist unbanned and still hold each role the token carries where it works
   * (`checkUserStanding`), so a disconnected client, a secured account, a ban, a lowered role or a deletion ends its
   * tokens at once; the session's roles are the token's checked ones, and nothing later reads the claims again. With `jwksUrl` instead of
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
 * a token works until it expires. With organizations and `auth`, the session's `memberships` reads the person's
 * organizations from the store when a list across them asks (`sessionMemberships`). With `apps`, the tokens of those apps are admitted too, with the roles each gives
 * its users here. With `auth.personalAccessTokens`, a bearer token with its prefix is a personal access token, looked up
 * in the store (`personalAccessTokenSessions`), here and for every audience, where it is the client with that audience's scope.
 * With `auth.oauthApi`, an OAuth access token (`typ: at+jwt`) is verified for the API's resource as `forAudience` verifies
 * one, as a bearer token only: the session keeps its `client`, and a token for another audience, such as MCP's, is refused.
 */
export const betterAuthAuthenticator = (options: BetterAuthAuthenticatorOptions): BetterAuthAuthenticator => {
  const tokens = betterAuthTokens(options)
  const { issuer } = tokens
  const organizations = options.organizations ?? Boolean(options.auth?.organizations)
  const { auth } = options
  // With personal access tokens on, a bearer token with the app's prefix is one of them, looked up in the store.
  const personal = auth?.personalAccessTokens && {
    prefix: auth.personalAccessTokens.prefix,
    sessionOf: personalAccessTokenSessions({ prefix: auth.personalAccessTokens.prefix, context: () => auth.$context as unknown as Promise<AuthContext>, organizations, ...(options.tenant !== undefined && { tenant: options.tenant }) }),
  }

  // The app's claims as a session, for its own tokens and those of another audience alike; with `auth`, also whether
  // the token still stands, as `standing` reads it from the store.
  type Standing = (context: AuthContext, payload: JWTPayload, session: Session) => Promise<{ signIn?: Session['signIn']; organizationRole?: OrganizationRole }>
  const sessionOf = (verifyOptions: Partial<JwtOptions>, standing: Standing): Authenticator => {
    const sessions = jwtSessions({
      ...tokens,
      rolesClaim: 'role',
      ...(organizations && { tenantClaim: 'org', extraRolesClaim: 'app_roles' }),
      ...(options.tenant !== undefined && { tenant: options.tenant }),
      ...verifyOptions,
    })
    const verify: Authenticator = async (request) => {
      const token = personal && personalAccessTokenOf(request, personal.prefix)
      if (personal && token !== undefined) {
        const { session, id, expiresAt } = await personal.sessionOf(token)
        // At the MCP endpoint, the token is the client, with the endpoint's scope: it can do what its user can.
        return verifyOptions.oauthClient ? { ...session, client: { id: personalAccessTokenClient(id), scopes: [mcpScope], expiresAt } } : session
      }
      const { payload, session } = await sessions(request)
      if (!auth) return session
      const { signIn, organizationRole } = await standing((await auth.$context) as unknown as AuthContext, payload, session)
      const withRole = organizationRole && session.tenant !== undefined ? { ...session, organization: { id: session.tenant, role: organizationRole } } : session
      return signIn ? { ...withRole, signIn } : withRole
    }
    if (!organizations) return verify
    return async (request) => {
      const session = await verify(request)
      const user = { ...session.user, roles: session.user.roles.filter((role) => role !== noGlobalRole) }
      // The app's own tokens read the person's other organizations from the store, once a list across them asks; an
      // outside app's token works in its own organization alone.
      let memberships: Promise<Membership[]> | undefined
      const across = auth && !verifyOptions.oauthClient && { memberships: async () => (memberships ??= auth.$context.then((context) => sessionMemberships(context as unknown as AuthContext, String(user.id), user.roles))) }
      // The organization role comes from the member row `verify` read for this request, never from the token's claim.
      return { ...session, user, ...(session.tenant !== undefined && { organization: { id: session.tenant, ...(session.organization?.role && { role: session.organization.role }) } }), ...across }
    }
  }

  // Each DPoP proof is reserved once: in the auth store, shared by every instance, or with only a JWKS URL in this process.
  let replayStore: Promise<DpopReplayStore> | undefined
  const dpopReplayStore = () =>
    (replayStore ??= options.auth ? options.auth.$context.then(({ internalAdapter }) => createDpopReplayStore(internalAdapter)) : Promise.resolve(createInMemoryDpopReplayStore()))

  const ownStanding: Standing = (context, payload, session) =>
    checkTokenStanding(context, tokenClaims(payload, session.user.roles, organizations ? session.tenant : undefined), organizations)
  // An access token's `sid` names the browser session that allowed the client, which may end long before the grant
  // does; revoking the grant ends its tokens instead (`revokeMcpGrants`), which the grant check sees. Its user and the
  // roles it carries are checked as the app's own tokens' are, so a ban, a lowered role or a deletion ends it at once.
  const grantStanding: Standing = async (context, payload, session) => {
    await checkMcpGrant(context.adapter, { userId: payload.sub!, clientId: session.client?.id, issuedAt: payload.iat })
    const { sessionId: _, ...claims } = tokenClaims(payload, session.user.roles, organizations ? session.tenant : undefined)
    const organizationRole = await checkUserStanding(context, claims, organizations)
    return organizationRole ? { organizationRole } : {}
  }
  const own = sessionOf({ audience: options.audience ?? issuer }, ownStanding)
  // With `oauth.api`, the access tokens clients get for the API are taken as bearer tokens, with the grant checks MCP's
  // tokens have; a token bound to a key is refused, as no proof is checked here.
  const api = auth?.oauthApi && sessionOf({ audience: auth.oauthApi.resource, typ: accessTokenType, oauthClient: true }, grantStanding)
  return Object.assign(withTrustedApps(api ? withAccessTokens(own, api) : own, issuer, options.apps ?? []), {
    forAudience: (audience: string) => sessionOf({ audience, typ: accessTokenType, dpop: { url: audience, replayStore: dpopReplayStore }, oauthClient: true }, grantStanding),
  })
}
