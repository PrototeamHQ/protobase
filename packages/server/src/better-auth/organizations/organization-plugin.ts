import { getCurrentAuthEndpointContext } from '@better-auth/core/context'
import { APIError } from 'better-auth/api'
import { organization, type OrganizationOptions } from 'better-auth/plugins/organization'
import { headersLocale } from '../../locale/request-locale'
import type { BetterAuthNames } from '../names/better-auth-names'
import { sendAuthEmail, type AuthMail } from '../auth-mail/send-auth-email'
import { checkAppRoleChange, globalRoles, parseAppRoles, effectiveRoles } from './app-roles'
import { invitationPage } from '../invitations/invitation-link-hook'
import { invitationLink, invitationToken } from '../invitations/invitation-token'
import type { ResolvedOrganizations } from './options'
import { superuserRole } from './role-definitions'
import { findMember, type AuthContext, type StoredMember, type StoredOrganization } from './store'

type Hooks = NonNullable<OrganizationOptions['organizationHooks']>

/** The organization plugin's `schema` option: its tables' names and the session's, with the app roles of members and invitations. */
const organizationSchema = (names: BetterAuthNames) =>
  ({
    ...names.schema('organization', 'session'),
    member: { ...names.schema('member').member, additionalFields: names.fields('member', ['appRoles']) },
    invitation: { ...names.schema('invitation').invitation, additionalFields: names.fields('invitation', ['appRoles']) },
  }) satisfies OrganizationOptions['schema']

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
  mail?: AuthMail
  /** The auth context, once the instance exists: the hooks read memberships through its adapter. */
  context: () => Promise<AuthContext>
  names: BetterAuthNames
}

/**
 * Better Auth's organization plugin as Protobase uses it: organization roles `owner`, `admin` and `member` with Better
 * Auth's own access control, app roles on members and invitations, ids from `generateId`, creators holding
 * `creatorAppRoles`, invitations checked against what the inviter may give and mailed with a signed link, and the
 * project's hooks after Protobase's.
 */
export const organizationPlugin = ({ resolved, secret, mail, context, names }: OrganizationPluginInput) => {
  const { definitions } = resolved

  const own: Hooks = {
    beforeCreateOrganization: async () => ({ data: { id: await resolved.generateId() } }),
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
      await (await context()).adapter.updateMany({
        model: 'session',
        where: [{ field: 'userId', value: member.userId }, { field: 'activeOrganizationId', value: member.organizationId }],
        update: { activeOrganizationId: null },
      })
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
    schema: organizationSchema(names),
    // Also on resend, which moves the expiry and so voids the earlier link. Without a mailer the inviter gets the link
    // in the answer instead (see the invitation endpoints). Better Auth hands this only the raw request, so the
    // request's origin as it resolved it comes from the endpoint the mail is sent in.
    ...(mail && {
      // In the inviter's language, the request's, when the app sets none.
      sendInvitationEmail: async ({ invitation, organization, inviter }, request) => {
        const page = invitationPage(resolved.invitationUrl, getCurrentAuthEndpointContext().context.baseURL)
        const url = invitationLink(page, await invitationToken(secret, invitation))
        await sendAuthEmail(mail, 'invitationEmail', invitation.email, { inviter: inviter.user.name || inviter.user.email, organization: organization.name, url, expiresAt: new Date(invitation.expiresAt) }, url, headersLocale(request?.headers))
      },
    }),
    organizationHooks: mergeHooks(own, resolved.options.hooks),
  })
}
