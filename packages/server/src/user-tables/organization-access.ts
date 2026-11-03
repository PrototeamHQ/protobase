import type { AccessContext } from '@protobase/schema'

/**
 * The organization's owners and admins, as the auth store holds their membership for this request, and superusers
 * working in it: no one without an organization, so a session that names none reaches nothing.
 */
export const organizationAdmins = ({ user, organization }: AccessContext) => {
  if (!organization) return false
  if (user?.roles?.includes('admin')) return true
  return organization.role === 'owner' || organization.role === 'admin'
}

/** `organizationAdmins` of the one organization `organizationId`, the one a table users add belongs to. */
export const organizationAdminsOf = (organizationId: string) => (context: AccessContext) =>
  context.organization !== undefined && String(context.organization.id) === organizationId && organizationAdmins(context)
