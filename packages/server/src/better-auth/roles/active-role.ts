import { globalRoles } from '../organizations/app-roles'
import { noGlobalRole } from '../organizations/role-definitions'
import { parseRoles } from '../parse-roles'

/**
 * The one role someone acts with: the first of `wanted` they hold (the session's active role, then the one they last
 * chose), else the first role they hold. `undefined` for someone without a role.
 */
export const resolveActiveRole = (held: readonly string[], wanted: readonly (string | null | undefined)[]) =>
  wanted.find((name): name is string => typeof name === 'string' && held.includes(name)) ?? held[0]

/** The role claims of a token: `role`, the global roles comma separated, and with organizations a membership's `app_roles`. */
export type RoleClaims = { role?: string | null; app_roles?: string[] }

/**
 * The claims narrowed to the active role (`resolveActiveRole`), so the token carries that role alone: in `role` when it
 * is held globally, in `app_roles` when held as a member, in both when both. Unchanged for someone without a role.
 */
export const narrowClaims = <Claims extends RoleClaims>(claims: Claims, wanted: readonly (string | null | undefined)[], organizations: boolean): Claims => {
  const global = organizations ? globalRoles(claims.role) : parseRoles(claims.role)
  const membership = claims.app_roles ?? []
  const active = resolveActiveRole([...new Set([...global, ...membership])], wanted)
  if (active === undefined) return claims
  return {
    ...claims,
    role: global.includes(active) ? active : noGlobalRole,
    ...(claims.app_roles && { app_roles: membership.includes(active) ? [active] : [] }),
  }
}
