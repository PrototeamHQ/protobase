import type { AdminAuth } from './create-auth'
import { parseRoles } from './users'

export type IssueTokenOptions = {
  email: string
  /** Lifetime in seconds. Default 15 minutes, at most 24 hours. */
  ttlSeconds?: number
}

const defaultTtlSeconds = 15 * 60
export const maxTokenTtlSeconds = 24 * 60 * 60

/**
 * Mints a bearer token for an existing user: signed with the JWT plugin's keys, same issuer, audience and claims
 * (`sub`, `email`, `role`) as `/api/auth/token`, so the API accepts it like a token from a browser session.
 * Host side only: there is no HTTP route for this.
 */
export const issueToken = async (auth: AdminAuth, options: IssueTokenOptions) => {
  const ttl = options.ttlSeconds ?? defaultTtlSeconds
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > maxTokenTtlSeconds) {
    throw new Error(`Token lifetime must be between 1 second and ${maxTokenTtlSeconds} seconds (24 hours)`)
  }
  const { adapter } = await auth.$context
  const user = await adapter.findOne<{ id: string; email: string; role?: string | null; banned?: boolean }>({
    model: 'user',
    where: [{ field: 'email', value: options.email.toLowerCase() }],
  })
  if (!user) throw new Error(`No user with email ${options.email}`)
  if (user.banned) throw new Error(`${options.email} is banned`)
  const issuedAt = Math.floor(Date.now() / 1000)
  const { token } = await auth.api.signJWT({
    body: { payload: { iat: issuedAt, exp: issuedAt + ttl, sub: user.id, email: user.email, role: parseRoles(user.role).join(',') } },
  })
  return { token, expiresAt: new Date((issuedAt + ttl) * 1000).toISOString() }
}
