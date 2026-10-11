import type { AdminAuth } from '../../better-auth/create-auth'
import { effectiveRoles, globalRoles } from '../../better-auth/organizations/app-roles'
import { findMember, type AuthContext } from '../../better-auth/organizations/store'
import { resolveActiveRole } from '../../better-auth/roles/active-role'
import { parseRoles } from '../../better-auth/users'
import type { TenantValue } from '../../types'

// The roles someone holds: their global roles and, with organizations, their app roles as a member of the tenant.
const heldIn = async (auth: AdminAuth, user: { id: string; role?: string | null }, tenant?: TenantValue) => {
  if (!auth.organizations) return parseRoles(user.role)
  const global = globalRoles(user.role)
  if (tenant === undefined) return global
  const { adapter } = (await auth.$context) as unknown as AuthContext
  const member = await findMember(adapter, { organizationId: String(tenant), userId: user.id })
  return member ? effectiveRoles(global, member.appRoles) : global
}

/**
 * The role someone acts with now, as their next session's token would carry it: the one they last chose while they
 * hold it, else their first (see `resolveActiveRole`). None for a user who is banned or gone, or holds no role.
 */
export const betterAuthOwnerRoles = (auth: AdminAuth) => async ({ id, tenant }: { id: string; tenant?: TenantValue }) => {
  const { internalAdapter } = (await auth.$context) as unknown as AuthContext
  const user = (await internalAdapter.findUserById(id)) as { id: string; role?: string | null; lastRole?: string | null; banned?: boolean | null } | null
  if (!user || user.banned) return []
  const active = resolveActiveRole(await heldIn(auth, user, tenant), [user.lastRole])
  return active === undefined ? [] : [active]
}
