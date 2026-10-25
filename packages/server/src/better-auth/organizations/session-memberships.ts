import type { Membership } from '../../types'
import { resolveActiveRole } from '../roles/active-role'
import { effectiveRoles, globalRoles } from './app-roles'
import { membershipsOf, type AuthContext } from './store'

/**
 * The organizations someone is a member of, read from the store, each with the role they would act with there after a
 * switch: the session's active role (`active`) when they hold it there, globally or as the member, else their first
 * role there, else none. Organizations they only enter with a global role are not memberships, so they are left out.
 */
export const sessionMemberships = async ({ adapter }: AuthContext, userId: string, active: readonly string[]): Promise<Membership[]> => {
  const user = await adapter.findOne<{ id: string; role?: string | null }>({ model: 'user', where: [{ field: 'id', value: userId }] })
  if (!user) return []
  const global = globalRoles(user.role)
  return (await membershipsOf(adapter, userId)).map((member) => {
    const role = resolveActiveRole(effectiveRoles(global, member.appRoles), active)
    return { tenant: member.organizationId, roles: role === undefined ? [] : [role] }
  })
}
