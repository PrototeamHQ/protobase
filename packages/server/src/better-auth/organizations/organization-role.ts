import type { AdminAuth } from '../create-auth'
import { findMember, organizationRoleOf, type AuthContext, type OrganizationRole } from './store'

/** The user's role in the organization, `undefined` when they are no member of it. */
export const organizationRole = (auth: AdminAuth) => async (organization: string, user: string): Promise<OrganizationRole | undefined> => {
  const { adapter } = (await auth.$context) as unknown as AuthContext
  const member = await findMember(adapter, { organizationId: organization, userId: user })
  return member && organizationRoleOf(member)
}
