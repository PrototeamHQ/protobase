import { APIError } from 'better-auth/api'
import { organization, type OrganizationOptions } from 'better-auth/plugins/organization'
import type { Mailer } from '../../mail/smtp-mailer'
import { checkAppRoleChange, globalRoles, parseAppRoles, effectiveRoles } from './app-roles'
import { invitationEmail } from './invitation-mail'
import { invitationLink, invitationToken } from './invitation-token'
import type { ResolvedOrganizations } from './options'
import { superuserRole } from './role-definitions'
import { findMember, type AuthContext, type StoredMember, type StoredOrganization } from './store'

type Hooks = NonNullable<OrganizationOptions['organizationHooks']>

/** The snake_case names of the organization plugin's tables and columns, with the app roles of members and invitations. */
export const organizationNames = {
  organization: { fields: { createdAt: 'created_at' } },
  member: {
    fields: { organizationId: 'organization_id', userId: 'user_id', createdAt: 'created_at' },
    additionalFields: { appRoles: { type: 'string[]', required: false, defaultValue: [], input: false, fieldName: 'app_roles' } },
  },
  invitation: {
    fields: { organizationId: 'organization_id', inviterId: 'inviter_id', expiresAt: 'expires_at', createdAt: 'created_at' },
    additionalFields: { appRoles: { type: 'string[]', required: false, defaultValue: [], input: true, fieldName: 'app_roles' } },
  },
  session: { fields: { activeOrganizationId: 'active_organization_id' } },
} satisfies OrganizationOptions['schema']

/** Runs Protobase's hook, then the project's, with the same data; data either returns is merged, the project's last. */
const mergeHooks = (own: Hooks, project: Hooks = {}): Hooks => {
  type Hook = (...args: unknown[]) => Promise<{ data?: Record<string, unknown> } | void>
  const keys = new Set([...Object.keys(own), ...Object.keys(project)]) as Set<keyof Hooks>
  return Object.fromEntries(
    [...keys].map((key) => {
      const first = own[key] as Hook | undefined
      const second = project[key] as Hook | undefined
      if (!first || !second) return [key, first ?? second]
      const both: Hook = async (...args) => {
        const data = { ...(await first(...args))?.data, ...(await second(...args))?.data }
        return Object.keys(data).length > 0 ? { data } : undefined
      }
      return [key, both]
    }),
  ) as Hooks
}

export type OrganizationPluginInput = {
  resolved: ResolvedOrganizations
  secret: string
  mailer?: Mailer
  /** The auth context, once the instance exists: the hooks read memberships through its adapter. */
  context: () => Promise<AuthContext>
}

/**
 * Better Auth's organization plugin as Protobase uses it: organization roles `owner`, `admin` and `member` with Better
 * Auth's own access control, app roles on members and invitations, ids from `generateId`, creators holding
 * `creatorAppRoles`, invitations checked against what the inviter may give and mailed with a signed link, and the
 * project's hooks after Protobase's.
 */
export const organizationPlugin = ({ resolved, secret, mailer, context }: OrganizationPluginInput) => {
  const { definitions } = resolved

  const own: Hooks = {
    beforeCreateOrganization: async () => ({ data: { id: resolved.generateId() } }),
    beforeAddMember: async ({ member }) => (member.role === 'owner' && member.appRoles === undefined ? { data: { appRoles: resolved.creatorAppRoles } } : undefined),
    afterCreateOrganization: async ({ organization, member }) => {
      await resolved.options.onCreated?.({ organization: organization as StoredOrganization, member: { ...(member as StoredMember), appRoles: parseAppRoles((member as { appRoles?: unknown }).appRoles) } })
    },
    beforeCreateInvitation: async ({ invitation, inviter }) => {
      const membership = await findMember((await context()).adapter, { organizationId: invitation.organizationId, userId: inviter.id })
      const held = effectiveRoles(globalRoles(inviter.role as string | null | undefined), membership?.appRoles)
      const refusal = checkAppRoleChange({ held, before: [], after: parseAppRoles(invitation.appRoles), definitions })
      if (refusal) throw new APIError(refusal.status, { code: refusal.code, message: refusal.message })
    },
    afterRemoveMember: async ({ member, user }) => {
      // Better Auth leaves the organization active on the removed person's other sessions; their next token would
      // still be refused (see `organizationClaims`), and here those sessions leave it, unless a global role enters it.
      if (globalRoles(user.role as string | null | undefined).length > 0) return
      const { internalAdapter } = await context()
      for (const session of await internalAdapter.listSessions(member.userId)) {
        if ((session as { activeOrganizationId?: string | null }).activeOrganizationId === member.organizationId) {
          await internalAdapter.updateSession(session.token, { activeOrganizationId: null })
        }
      }
    },
    beforeDeleteOrganization: async ({ organization }) => {
      await resolved.options.beforeDelete?.(organization as StoredOrganization)
    },
  }

  return organization({
    creatorRole: 'owner',
    allowUserToCreateOrganization: (user) => resolved.create === 'everyone' || globalRoles(user.role as string | null | undefined).includes(superuserRole),
    invitationExpiresIn: resolved.invitationExpiresIn,
    membershipLimit: resolved.membershipLimit,
    // Protobase's own accept checks this too; Better Auth's get and reject by id ask for it with this on.
    requireEmailVerificationOnInvitation: true,
    cancelPendingInvitationsOnReInvite: true,
    schema: organizationNames,
    // Also on resend, which moves the expiry and so voids the earlier link. Without a mailer the inviter gets the link
    // in the answer instead (see the invitation endpoints).
    ...(mailer && {
      sendInvitationEmail: async ({ invitation, organization, inviter }) => {
        const token = await invitationToken(secret, invitation)
        await mailer.send(invitationEmail({ to: invitation.email, inviter: inviter.user.name || inviter.user.email, organization: organization.name, url: invitationLink(resolved.invitationUrl, token), expiresAt: invitation.expiresAt }))
      },
    }),
    organizationHooks: mergeHooks(own, resolved.options.hooks),
  })
}
