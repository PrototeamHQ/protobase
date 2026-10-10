import { authError } from './auth-error'
import type { BetterAuthClient } from './better-auth-client'

/** Who manages an organization: owners everything, admins its members and details, members nothing. */
export type OrganizationRole = 'owner' | 'admin' | 'member'

export type Organization = { id: string; name: string; slug: string; logo?: string | null }

/**
 * The organization the session works in: for a member with their organization role, app roles there and membership
 * id; for someone with a global role who entered it without being a member, without them. `globalRoles` are the
 * person's roles in every organization.
 */
export type CurrentOrganization = {
  organization: Organization | null
  role?: OrganizationRole
  appRoles?: string[]
  memberId?: string
  globalRoles: string[]
}

export type OrganizationMember = { id: string; userId: string; name: string; email: string; role: OrganizationRole; appRoles: string[]; createdAt: string }

/** `organizationName` comes with the person's own invitations, which span organizations. */
export type OrganizationInvitation = { id: string; email: string; role: OrganizationRole; appRoles: string[]; status: string; expiresAt: string; organizationName?: string }

/** An invitation as its link shows it, before it is accepted. */
export type InvitationPreview = {
  organization: { id: string; name: string }
  inviter: { name: string }
  email: string
  role: OrganizationRole
  appRoles: string[]
  expiresAt: string
  hasAccount: boolean
}

/** What inviting gives back: the invitation, and its link when the server cannot email it. */
export type InvitationSent = { invitation: OrganizationInvitation; link?: string }

type RawMember = { id: string; userId: string; role: string; appRoles?: unknown; createdAt: string; user: { name?: string; email: string } }
type RawInvitation = { id: string; email: string; role: string; appRoles?: unknown; status: string; expiresAt: string; link?: string; organizationName?: string }

const rolesOf = (value: unknown) => (Array.isArray(value) ? value.filter((name): name is string => typeof name === 'string') : typeof value === 'string' ? (JSON.parse(value) as string[]) : [])

const organizationRole = (role: string): OrganizationRole => {
  const roles = role.split(',')
  return roles.includes('owner') ? 'owner' : roles.includes('admin') ? 'admin' : 'member'
}

const member = (raw: RawMember): OrganizationMember => ({
  id: raw.id,
  userId: raw.userId,
  name: raw.user.name || raw.user.email,
  email: raw.user.email,
  role: organizationRole(raw.role),
  appRoles: rolesOf(raw.appRoles),
  createdAt: new Date(raw.createdAt).toISOString(),
})

const invitation = (raw: RawInvitation): OrganizationInvitation => ({
  id: raw.id,
  email: raw.email,
  role: organizationRole(raw.role),
  appRoles: rolesOf(raw.appRoles),
  status: raw.status,
  expiresAt: new Date(raw.expiresAt).toISOString(),
  ...(raw.organizationName && { organizationName: raw.organizationName }),
})

/**
 * The signed-in person's organizations: switching, creating and managing them, their members and invitations, and
 * invitation links. A change of the organization one works in fetches a new token at once (`refreshToken`), since the
 * token names it. Each call rejects with `AuthError`.
 */
export const organizationsClient = (client: BetterAuthClient, refreshToken: () => Promise<unknown>) => {
  const call = async <T>(path: string, fallback: string, init: { method?: 'GET' | 'POST'; body?: object; query?: Record<string, string> } = {}) => {
    const { data, error } = await client.$fetch<T>(path, { method: init.method ?? (init.body ? 'POST' : 'GET'), ...(init.body && { body: init.body }), ...(init.query && { query: init.query }) })
    if (error) throw authError(error, fallback)
    return data as T
  }
  const thenRefresh = async <T>(result: T) => {
    await refreshToken()
    return result
  }

  return {
    /** The organizations the person is a member of. */
    list: async () => (await call<Organization[]>('/organization/list', 'Could not read your organizations')) ?? [],

    current: () => call<CurrentOrganization>('/organization/current', 'Could not read the current organization'),

    /** Works in another organization from now on; `null` for none. */
    switchTo: async (organizationId: string | null) =>
      thenRefresh(await call<{ organizationId: string | null }>('/organization/switch', 'Could not switch the organization', { body: { organizationId } })),

    /** Every organization whose name or slug contains `query`, for people with a global role. */
    search: async (query: string) => (await call<{ organizations: Organization[] }>('/organization/search', 'Could not search the organizations', { query: { query } })).organizations,

    /** Creates an organization, owned by the person with every app role, and works in it. */
    create: async (input: { name: string; slug: string }) => thenRefresh(await call<Organization>('/organization/create', 'Could not create the organization', { body: input })),

    rename: (organizationId: string, data: { name?: string; slug?: string }) =>
      call<Organization>('/organization/update', 'Could not change the organization', { body: { organizationId, data } }),

    /** Deletes an organization; the server refuses one that still has records. */
    remove: async (organizationId: string) => thenRefresh(await call<Organization>('/organization/delete', 'Could not delete the organization', { body: { organizationId } })),

    leave: async (organizationId: string) => thenRefresh(await call<unknown>('/organization/leave', 'Could not leave the organization', { body: { organizationId } })),

    members: async (organizationId: string) =>
      (await call<{ members: RawMember[] }>('/organization/list-members', 'Could not read the members', { query: { organizationId, limit: '1000' } })).members.map(member),

    setRole: (organizationId: string, memberId: string, role: OrganizationRole) =>
      call<unknown>('/organization/update-member-role', 'Could not change the role', { body: { organizationId, memberId, role } }),

    /** Sets a member's app roles; only the roles the person may give can change. */
    setAppRoles: (memberId: string, appRoles: string[]) => call<unknown>('/organization/set-app-roles', 'Could not change the app roles', { body: { memberId, appRoles } }),

    removeMember: (organizationId: string, memberId: string) => call<unknown>('/organization/remove-member', 'Could not remove the member', { body: { organizationId, memberIdOrEmail: memberId } }),

    /** Hands the organization over to a member; the person stays as `keepAs`, an admin unless said otherwise. */
    transferOwnership: (memberId: string, keepAs: 'admin' | 'member' = 'admin') =>
      call<unknown>('/organization/transfer-ownership', 'Could not hand the organization over', { body: { memberId, keepAs } }),

    invitations: async (organizationId: string) =>
      ((await call<RawInvitation[]>('/organization/list-invitations', 'Could not read the invitations', { query: { organizationId } })) ?? []).map(invitation),

    /** Invites an address; the link comes back only when the server cannot email it. */
    invite: async (organizationId: string, input: { email: string; role: OrganizationRole; appRoles: string[] }): Promise<InvitationSent> => {
      const raw = await call<RawInvitation>('/organization/invite-member', 'Could not send the invitation', { body: { organizationId, ...input } })
      return { invitation: invitation(raw), ...(raw.link && { link: raw.link }) }
    },

    /** Sends an invitation again with a new link, which voids the earlier one. */
    resend: async (organizationId: string, sent: Pick<OrganizationInvitation, 'email' | 'role'>): Promise<InvitationSent> => {
      const raw = await call<RawInvitation>('/organization/invite-member', 'Could not send the invitation again', { body: { organizationId, email: sent.email, role: sent.role, resend: true } })
      return { invitation: invitation(raw), ...(raw.link && { link: raw.link }) }
    },

    revoke: (invitationId: string) => call<unknown>('/organization/cancel-invitation', 'Could not revoke the invitation', { body: { invitationId } }),

    /** The pending invitations for the person's own address. */
    myInvitations: async () => ((await call<RawInvitation[]>('/organization/list-user-invitations', 'Could not read your invitations')) ?? []).map(invitation),

    /** What an invitation link is for; works signed out. */
    invitation: (token: string) => call<InvitationPreview>('/invitation', 'This invitation link is not valid', { query: { token } }),

    /** Accepts an invitation signed in as its address, and works in its organization. */
    accept: async (token: string) => thenRefresh(await call<unknown>('/invitation/accept', 'Could not accept the invitation', { body: { token } })),

    /** Creates an account for an invited address without one, accepts the invitation and signs in. */
    signUpFromInvitation: async (token: string, input: { name: string; password?: string }) =>
      thenRefresh(await call<unknown>('/invitation/sign-up', 'Could not create your account', { body: { token, ...input } })),
  }
}

export type OrganizationsClient = ReturnType<typeof organizationsClient>
