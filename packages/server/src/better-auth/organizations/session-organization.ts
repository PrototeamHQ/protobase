import { globalRoles } from './app-roles'
import { initialOrganization } from './active-organization'
import { findMember, findOrganization, membershipsOf, organizationRoleOf, summaries, type AuthContext } from './store'

type Adapter = AuthContext['adapter']
type SessionUser = { id: string; role?: string | null }

/** The user field that keeps the organization someone last worked in, for their next sign-in. */
export const lastOrganizationField = { lastOrganizationId: { type: 'string', required: false, input: false, fieldName: 'last_organization_id' } } as const

/** Whether someone may work in an organization: a member, or holding a global role, which enters every one. */
export const mayEnter = async (adapter: Adapter, user: SessionUser, organizationId: string) => {
  if (await findMember(adapter, { organizationId, userId: user.id })) return true
  return globalRoles(user.role).length > 0 && (await findOrganization(adapter, organizationId)) !== null
}

/**
 * The token's organization claims for a session: `org`, the active organization, while the person may still work in
 * it; for a member also `org_role`, their organization role, and `app_roles`, their app roles there. Read when the
 * token is issued, so a removed member or a changed role shows within the token's lifetime.
 */
export const organizationClaims = async (adapter: Adapter, user: SessionUser, activeOrganizationId?: string | null) => {
  if (!activeOrganizationId) return {}
  const member = await findMember(adapter, { organizationId: activeOrganizationId, userId: user.id })
  if (member) return { org: activeOrganizationId, org_role: organizationRoleOf(member), app_roles: member.appRoles }
  if (await mayEnter(adapter, user, activeOrganizationId)) return { org: activeOrganizationId }
  return {}
}

type SessionRow = { userId: string; activeOrganizationId?: string | null }

/**
 * Better Auth's session hooks for organizations: a new session starts in the organization the person last worked in
 * (`initialOrganization`), and a session's change of organization is kept on the user as the next one's start.
 */
export const sessionOrganizationHooks = (context: () => Promise<AuthContext>) => ({
  create: {
    before: async (session: SessionRow & Record<string, unknown>) => {
      const { adapter, internalAdapter } = await context()
      const user = (await internalAdapter.findUserById(session.userId)) as (SessionUser & { lastOrganizationId?: string | null }) | null
      if (!user) return
      const last = user.lastOrganizationId
      const activeOrganizationId = initialOrganization({
        memberships: summaries(await membershipsOf(adapter, user.id)),
        last,
        entersAny: globalRoles(user.role).length > 0,
        lastExists: Boolean(last) && (await findOrganization(adapter, last!)) !== null,
      })
      return activeOrganizationId ? { data: { ...session, activeOrganizationId } } : undefined
    },
  },
  update: {
    after: async (session: SessionRow) => {
      if (!session.activeOrganizationId) return
      const { internalAdapter } = await context()
      const user = (await internalAdapter.findUserById(session.userId)) as { lastOrganizationId?: string | null } | null
      if (user && user.lastOrganizationId !== session.activeOrganizationId) {
        await internalAdapter.updateUser(session.userId, { lastOrganizationId: session.activeOrganizationId })
      }
    },
  },
})
