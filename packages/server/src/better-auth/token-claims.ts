import { organizationClaims } from './organizations/session-organization'
import type { AuthContext } from './organizations/store'
import { narrowClaims } from './roles/active-role'

type ClaimsUser = { id: string; email: string; role?: string | null }

export type TokenClaimsOptions = {
  /** The roles to narrow to, the first held one winning (see `narrowClaims`). */
  wanted: readonly (string | null | undefined)[]
  /** The organization the token works in, with organizations. */
  organizationId?: string | null
  /** The store to read memberships from: given only with organizations. */
  organizations?: AuthContext['adapter']
}

/**
 * The claims of a token for `user`: the address and the role claims narrowed to one role; with organizations also the
 * claims of `organizationId` while they may work in it (see `organizationClaims`).
 */
export const tokenClaims = async (user: ClaimsUser, { wanted, organizationId, organizations }: TokenClaimsOptions) => {
  const claims = { role: user.role, ...(organizations && (await organizationClaims(organizations, user, organizationId))) }
  return { email: user.email, ...narrowClaims(claims, wanted, Boolean(organizations)) }
}
