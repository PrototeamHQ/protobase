import type { AdminAuth } from './create-auth'
import { findOrganizationByKey } from './organizations/host'
import { mayEnter, startingOrganization } from './organizations/session-organization'
import type { AuthContext } from './organizations/store'
import { tokenClaims } from './token-claims'

export type IssueTokenOptions = {
  email: string
  /** Lifetime in seconds. Default 15 minutes, at most 24 hours. */
  ttlSeconds?: number
  /**
   * With organizations, the organization the token works in, by id or slug; refused unless the person may work in it.
   * Default: the one a new session of theirs would start in.
   */
  organization?: string
}

const defaultTtlSeconds = 15 * 60
export const maxTokenTtlSeconds = 24 * 60 * 60

type TokenUser = { id: string; email: string; role?: string | null; lastRole?: string | null; lastOrganizationId?: string | null; banned?: boolean }

// The organization the token works in: the one named, which the person must be able to enter, else the one a new
// session of theirs starts in.
const organizationOf = async (auth: AdminAuth, adapter: AuthContext['adapter'], user: TokenUser, organization?: string) => {
  if (organization === undefined) return startingOrganization(adapter, user)
  const found = await findOrganizationByKey(auth, organization)
  if (!(await mayEnter(adapter, user, found.id))) throw new Error(`${user.email} may not work in organization "${organization}"`)
  return found.id
}

/**
 * Mints a bearer token for an existing user: signed with the JWT plugin's keys, same issuer, audience and claims as
 * `/api/auth/token` for a new session of theirs (see `tokenClaims`), so the API accepts it like a token from a browser
 * session. It carries the role the user last chose, else their first; with organizations, the claims of
 * `options.organization`, else of the organization a new session would start in.
 * Host side only: there is no HTTP route for this.
 */
export const issueToken = async (auth: AdminAuth, options: IssueTokenOptions) => {
  const ttl = options.ttlSeconds ?? defaultTtlSeconds
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > maxTokenTtlSeconds) {
    throw new Error(`Token lifetime must be between 1 second and ${maxTokenTtlSeconds} seconds (24 hours)`)
  }
  if (options.organization !== undefined && !auth.organizations) throw new Error('Organizations are off: a token cannot name an organization')
  const { adapter } = (await auth.$context) as unknown as AuthContext
  const user = await adapter.findOne<TokenUser>({ model: 'user', where: [{ field: 'email', value: options.email.toLowerCase() }] })
  if (!user) throw new Error(`No user with email ${options.email}`)
  if (user.banned) throw new Error(`${options.email} is banned`)
  const organizationId = auth.organizations ? await organizationOf(auth, adapter, user, options.organization) : undefined
  const claims = await tokenClaims(user, { wanted: [user.lastRole], organizationId, ...(auth.organizations && { organizations: adapter }) })
  const issuedAt = Math.floor(Date.now() / 1000)
  await auth.api.ensureSigningKey()
  const { token } = await auth.api.signJWT({
    body: { payload: { iat: issuedAt, exp: issuedAt + ttl, sub: user.id, ...claims } },
  })
  return { token, expiresAt: new Date((issuedAt + ttl) * 1000).toISOString() }
}
