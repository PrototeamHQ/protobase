import { enforceDpopBinding, isDpopBindingError, parseAccessTokenAuthorization, type DpopReplayStore } from 'better-auth/oauth2'
import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose'
import { MissingCredentials, unauthorized } from '../problem'
import type { Authenticator, Session, TenantValue } from '../types'

export type JwtOptions = {
  /** JWKS endpoint of the identity provider; or pass `keys`, for example `createLocalJWKSet`. */
  jwksUrl?: string | URL
  keys?: JWTVerifyGetKey
  /** The accepted issuer, or several. */
  issuer?: string | string[]
  /** The accepted audience, or several. */
  audience?: string | string[]
  /** Claim holding the roles, an array, or a string separated by spaces or commas. Default `roles`. */
  rolesClaim?: string
  /** A second claim whose roles are added to those of `rolesClaim`, such as an organization membership's. */
  extraRolesClaim?: string
  /** Claim holding the tenant. Default `tenant`. */
  tenantClaim?: string
  /** Accepted signature algorithms. Default: asymmetric ones only, so a token can never be "verified" with a public key used as an HMAC secret. */
  algorithms?: string[]
  /** A fixed tenant (or resolver) used instead of any claim, for single-tenant deployments. */
  tenant?: TenantValue | (() => Promise<TenantValue | undefined>)
  /** The token type its header must name, such as `at+jwt` for an OAuth access token (RFC 9068). Default any. */
  typ?: string
  /**
   * Takes OAuth access tokens bound to a key (DPoP, RFC 9449) as well as bearer ones: the `DPoP` scheme with a proof in
   * the `DPoP` header, made for `url` with the request's method. A bound token works only with a fresh proof from its
   * key, each proof once (`replayStore`); a bearer token is refused with the `DPoP` scheme. Default bearer tokens only.
   */
  dpop?: { url: string; replayStore: () => Promise<DpopReplayStore> }
  /** Keeps the OAuth client the token was issued to, its `client_id` and `scope`, in the session's `client`. */
  oauthClient?: boolean
}

const asymmetric = ['EdDSA', 'ES256', 'ES384', 'ES512', 'RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512']

const rolesOf = (claim: unknown) => {
  if (typeof claim === 'string') return claim.split(/[\s,]+/).filter(Boolean)
  return Array.isArray(claim) ? claim.filter((role): role is string => typeof role === 'string') : []
}

// The token of `Authorization: Bearer <token>`, or with `dpop` also `DPoP <token>`, with the scheme it came with.
const authorizationOf = (header: string, dpop: boolean) => {
  if (dpop) {
    const authorization = parseAccessTokenAuthorization(header)
    if (!authorization || authorization.scheme === 'Unknown' || !authorization.token) throw unauthorized('Send an access token in the Authorization header')
    return authorization
  }
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) throw unauthorized('Send a bearer token in the Authorization header')
  return { scheme: 'Bearer' as const, token }
}

const scopesOf = (claim: unknown) => (typeof claim === 'string' ? claim.split(' ').filter(Boolean) : [])

export type JwtVerifyOptions = Pick<JwtOptions, 'jwksUrl' | 'keys' | 'issuer' | 'audience' | 'algorithms' | 'typ'>

/** Verifies a JWT against a JWKS and returns its claims; a token that does not verify is a 401 problem. */
export const jwtVerifier = (options: JwtVerifyOptions) => {
  const keys = options.keys ?? (options.jwksUrl ? createRemoteJWKSet(new URL(options.jwksUrl)) : undefined)
  if (!keys) throw new Error('jwtAuthenticator needs jwksUrl or keys')
  return async (token: string): Promise<JWTPayload> => {
    const verified = await jwtVerify(token, keys, {
      algorithms: options.algorithms ?? asymmetric,
      ...(options.issuer && { issuer: options.issuer }),
      ...(options.audience && { audience: options.audience }),
      ...(options.typ && { typ: options.typ }),
    }).catch((error: unknown) => {
      if (error instanceof errors.JOSEError) throw unauthorized('The bearer token is invalid or expired')
      throw error
    })
    return verified.payload
  }
}

/** Like `jwtAuthenticator`, and also returns the verified claims, for an authenticator that checks more of them. */
export const jwtSessions = (options: JwtOptions) => {
  const { rolesClaim = 'roles', tenantClaim = 'tenant' } = options
  const verify = jwtVerifier(options)
  return async (request: Request): Promise<{ payload: JWTPayload; session: Session }> => {
    const header = request.headers.get('authorization')
    if (header === null) throw new MissingCredentials('Send a bearer token in the Authorization header')
    const authorization = authorizationOf(header, Boolean(options.dpop))
    const payload = await verify(authorization.token)
    if (options.dpop) {
      const { url, replayStore } = options.dpop
      const proofJwt = request.headers.get('dpop') ?? undefined
      await enforceDpopBinding({ payload, authorization, proofJwt, method: request.method, url, replayStore: await replayStore() }).catch((error: unknown) => {
        if (isDpopBindingError(error)) throw unauthorized(error.message)
        throw error
      })
    }
    const { sub, [tenantClaim]: tenant, [rolesClaim]: roles } = payload
    const extraRoles = options.extraRolesClaim === undefined ? [] : rolesOf(payload[options.extraRolesClaim])
    if (!sub) throw unauthorized('The bearer token has no subject')
    const claimed = typeof tenant === 'string' || typeof tenant === 'number' ? tenant : undefined
    const tenantValue = options.tenant === undefined ? claimed : typeof options.tenant === 'function' ? await options.tenant() : options.tenant
    const { client_id: clientId, scope } = payload
    const client = options.oauthClient && typeof clientId === 'string' ? { client: { id: clientId, scopes: scopesOf(scope) } } : {}
    const session = { user: { id: sub, roles: [...new Set([...rolesOf(roles), ...extraRoles])] }, ...(tenantValue !== undefined && { tenant: tenantValue }), ...client }
    return { payload, session }
  }
}

/** Verifies `Authorization: Bearer <jwt>` against a JWKS; `sub` is the user id. Without the header, `MissingCredentials`. */
export const jwtAuthenticator = (options: JwtOptions): Authenticator => {
  const sessions = jwtSessions(options)
  return async (request) => (await sessions(request)).session
}
