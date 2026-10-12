import { createRemoteJWKSet, decodeJwt, errors, type JWTVerifyGetKey } from 'jose'
import { checkedUrl } from '../checked-url'
import { jwtAuthenticator } from '../auth/jwt'
import { forbidden } from '../problem'
import type { Authenticator, Session, TenantValue } from '../types'
import { authBasePath } from './create-auth'

/**
 * Another Protobase app whose signed-in users this API admits with the tokens that app issues, so its admin app can
 * draw this API's resources (see `options.sources` there). `issuer` is that app's Better Auth `baseURL`, the issuer and
 * audience of its tokens; its keys are read from `<issuer>/api/auth/jwks`. `roles` gives its roles the ones they are
 * here, `{ admin: 'shop' }`: a role it does not list is dropped, and a user left with none is refused. Its users work
 * in `tenant` when the resources have one; nothing in its tokens names a tenant here. `keys` replaces reading its key
 * set, for tests or keys at hand.
 */
export type TrustedApp = { issuer: string; roles: Record<string, string | string[]>; tenant?: TenantValue; keys?: JWTVerifyGetKey }

// The issuer a token claims, unverified: it only picks which keys verify it.
const claimedIssuer = (request: Request) => {
  const [scheme, token] = (request.headers.get('authorization') ?? '').split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return undefined
  try {
    const { iss } = decodeJwt(token)
    return typeof iss === 'string' ? iss : undefined
  } catch (error) {
    if (error instanceof errors.JOSEError) return undefined
    throw error
  }
}

const trustedAuthenticator = (app: TrustedApp, issuer: string): Authenticator => {
  const verify = jwtAuthenticator({ keys: app.keys ?? createRemoteJWKSet(new URL(`${authBasePath}/jwks`, issuer)), issuer, audience: issuer, rolesClaim: 'role', extraRolesClaim: 'app_roles' })
  const host = new URL(issuer).host
  return async (request) => {
    const { user } = await verify(request)
    const roles = [...new Set(user.roles.flatMap((role) => (Object.hasOwn(app.roles, role) ? app.roles[role]! : [])))]
    if (roles.length === 0) throw forbidden('no-role', `Your role in ${host} gives you no role here`)
    const session: Session = { user: { id: `${user.id}@${host}`, roles }, ...(app.tenant !== undefined && { tenant: app.tenant }) }
    return session
  }
}

/**
 * Admits the users of the `apps` this API trusts beside its own: a token whose issuer is one of theirs is verified
 * against that app's keys, its roles given theirs here and its user id made `<sub>@<that app's host>`, unique beside this
 * app's own users; every other token goes to `own`. A trusted app cannot have `ownIssuer`.
 */
export const withTrustedApps = (own: Authenticator, ownIssuer: string, apps: readonly TrustedApp[]): Authenticator => {
  if (apps.length === 0) return own
  const byIssuer = new Map(apps.map((app) => {
    const issuer = checkedUrl(app.issuer.trim(), `The trusted app's issuer "${app.issuer}"`)
    if (issuer === checkedUrl(ownIssuer, 'issuer')) throw new Error(`The trusted app ${issuer} is this app itself; its own tokens are admitted already`)
    return [issuer, trustedAuthenticator(app, issuer)] as const
  }))
  return (request) => {
    const issuer = claimedIssuer(request)
    const trusted = issuer === undefined ? undefined : byIssuer.get(issuer)
    return trusted ? trusted(request) : own(request)
  }
}
