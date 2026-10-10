import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { unauthorized } from '../problem'
import type { Authenticator, TenantValue } from '../types'

export type JwtOptions = {
  /** JWKS endpoint of the identity provider; or pass `keys`, for example `createLocalJWKSet`. */
  jwksUrl?: string | URL
  keys?: JWTVerifyGetKey
  issuer?: string
  audience?: string
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
}

const asymmetric = ['EdDSA', 'ES256', 'ES384', 'ES512', 'RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512']

const rolesOf = (claim: unknown) => {
  if (typeof claim === 'string') return claim.split(/[\s,]+/).filter(Boolean)
  return Array.isArray(claim) ? claim.filter((role): role is string => typeof role === 'string') : []
}

/** Verifies `Authorization: Bearer <jwt>` against a JWKS; `sub` is the user id. */
export const jwtAuthenticator = (options: JwtOptions): Authenticator => {
  const { rolesClaim = 'roles', tenantClaim = 'tenant' } = options
  const keys = options.keys ?? (options.jwksUrl ? createRemoteJWKSet(new URL(options.jwksUrl)) : undefined)
  if (!keys) throw new Error('jwtAuthenticator needs jwksUrl or keys')
  return async (request) => {
    const [scheme, token] = (request.headers.get('authorization') ?? '').split(' ')
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw unauthorized('Send a bearer token in the Authorization header')
    const verified = await jwtVerify(token, keys, { algorithms: options.algorithms ?? asymmetric, ...(options.issuer && { issuer: options.issuer }), ...(options.audience && { audience: options.audience }) }).catch((error: unknown) => {
      if (error instanceof errors.JOSEError) throw unauthorized('The bearer token is invalid or expired')
      throw error
    })
    const { sub, [tenantClaim]: tenant, [rolesClaim]: roles } = verified.payload
    const extraRoles = options.extraRolesClaim === undefined ? [] : rolesOf(verified.payload[options.extraRolesClaim])
    if (!sub) throw unauthorized('The bearer token has no subject')
    const claimed = typeof tenant === 'string' || typeof tenant === 'number' ? tenant : undefined
    const tenantValue = options.tenant === undefined ? claimed : typeof options.tenant === 'function' ? await options.tenant() : options.tenant
    return { user: { id: sub, roles: [...new Set([...rolesOf(roles), ...extraRoles])] }, ...(tenantValue !== undefined && { tenant: tenantValue }) }
  }
}
