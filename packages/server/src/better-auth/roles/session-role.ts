import { effectiveRoles, globalRoles } from '../organizations/app-roles'
import { findMember, type AuthContext } from '../organizations/store'
import { parseRoles } from '../parse-roles'
import { resolveActiveRole } from './active-role'

export type RoleUser = { id: string; role?: string | null; lastRole?: string | null }
export type RoleSession = { activeRole?: string | null; activeOrganizationId?: string | null }

/**
 * The roles someone holds where the session works: their roles, or with organizations their global roles and then
 * their app roles as a member of the active organization.
 */
export const heldRoles = async (context: AuthContext, user: RoleUser, session: RoleSession) => {
  if (!context.hasPlugin('organization')) return parseRoles(user.role)
  const organizationId = session.activeOrganizationId
  const member = organizationId ? await findMember(context.adapter, { organizationId, userId: user.id }) : undefined
  return effectiveRoles(globalRoles(user.role), member?.appRoles)
}

/** The roles held and the one the session acts with, as its next token carries it. */
export const sessionRoles = async (context: AuthContext, { user, session }: { user: RoleUser; session: RoleSession }) => {
  const held = await heldRoles(context, user, session)
  return { held, active: resolveActiveRole(held, [session.activeRole, user.lastRole]) }
}
