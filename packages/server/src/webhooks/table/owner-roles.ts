import type { AdminAuth } from '../../better-auth/create-auth'
import { effectiveRoles, globalRoles } from '../../better-auth/organizations/app-roles'
import { findMember, type AuthContext } from '../../better-auth/organizations/store'
import { parseRoles } from '../../better-auth/users'
import type { TenantValue } from '../../types'

/**
 * The roles someone holds now, as their next token would carry them: their global roles and, with organizations, their
 * app roles as a member of the tenant. None for a user who is banned or gone.
 */
export const betterAuthOwnerRoles = (auth: AdminAuth) => async ({ id, tenant }: { id: string; tenant?: TenantValue }) => {
  const { adapter, internalAdapter } = (await auth.$context) as unknown as AuthContext
  const user = (await internalAdapter.findUserById(id)) as { role?: string | null; banned?: boolean | null } | null
  if (!user || user.banned) return []
  if (!auth.organizations) return parseRoles(user.role)
  const global = globalRoles(user.role)
  if (tenant === undefined) return global
  const member = await findMember(adapter, { organizationId: String(tenant), userId: id })
  return member ? effectiveRoles(global, member.appRoles) : global
}
