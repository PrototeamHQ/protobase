import type { Session } from '../types'

const sameRoles = (a: readonly string[], b: readonly string[]) => {
  const roles = new Set(a)
  return roles.size === new Set(b).size && b.every((role) => roles.has(role))
}

/** Whether two resolutions of a caller give the same user, tenant, organization and roles, in any order. */
export const sameCaller = (a: Session, b: Session) =>
  a.user.id === b.user.id && a.tenant === b.tenant && a.organization?.id === b.organization?.id && sameRoles(a.user.roles, b.user.roles)
