import { authError } from './auth-error'
import type { RoleLabel } from './auth-types'
import type { BetterAuthClient } from './better-auth-client'

/** Someone who can sign in, as an admin sees them: their roles, and whether they are blocked from signing in. */
export type AppUser = { id: string; name: string; email: string; roles: string[]; blocked: boolean; createdAt: string }

/** A page of users and how many there are in all. */
export type UsersFound = { users: AppUser[]; total: number }

/** A pending invitation to the app, to make an account with `roles`. */
export type UserInvitation = { id: string; email: string; roles: string[]; expiresAt: string }

/** What inviting gives back: the invitation, and its link when the server cannot email it. */
export type UserInvitationSent = { invitation: UserInvitation; link?: string }

type RawUser = { id: string; name?: string | null; email: string; role?: string | string[] | null; banned?: boolean | null; createdAt: string }
type RawInvitation = Omit<UserInvitation, 'expiresAt'> & { expiresAt: string | Date; link?: string }

const pageSize = 20

// Better Auth stores several roles comma separated.
const rolesOf = (role: RawUser['role']) => (Array.isArray(role) ? role : (role ?? '').split(',').map((name) => name.trim()).filter(Boolean))

const user = (raw: RawUser): AppUser => ({
  id: raw.id,
  name: raw.name || raw.email,
  email: raw.email,
  roles: rolesOf(raw.role),
  blocked: Boolean(raw.banned),
  createdAt: new Date(raw.createdAt).toISOString(),
})

const invitation = (raw: RawInvitation): UserInvitation => ({ id: raw.id, email: raw.email, roles: raw.roles, expiresAt: new Date(raw.expiresAt).toISOString() })

const sent = (raw: RawInvitation): UserInvitationSent => ({ invitation: invitation(raw), ...(raw.link && { link: raw.link }) })

/**
 * Managing the people who can sign in, for admins: Better Auth's admin endpoints to list, create, set roles and block,
 * and Protobase's invitations to the app, which work with or without organizations. Each call rejects with `AuthError`.
 */
export const usersClient = (client: BetterAuthClient) => {
  const call = async <T>(path: string, fallback: string, init: { body?: object; query?: Record<string, string> } = {}) => {
    const { data, error } = await client.$fetch<T>(path, { method: init.body ? 'POST' : 'GET', ...(init.body && { body: init.body }), ...(init.query && { query: init.query }) })
    if (error) throw authError(error, fallback)
    return data as T
  }

  return {
    /** 20 users from `offset`, oldest first, whose address contains `query`, and the total. */
    search: async (query: string, offset = 0): Promise<UsersFound> => {
      const found = await call<{ users: RawUser[]; total: number }>('/admin/list-users', 'Could not read the users', {
        query: {
          limit: String(pageSize),
          sortBy: 'createdAt',
          sortDirection: 'asc',
          ...(offset > 0 && { offset: String(offset) }),
          ...(query && { searchValue: query, searchField: 'email' }),
        },
      })
      return { users: found.users.map(user), total: found.total }
    },

    /** Creates an account; without a password, the person signs in another way the sign-in policy allows, such as an emailed code. */
    create: async (input: { email: string; name: string; password?: string; roles: string[] }) =>
      user((await call<{ user: RawUser }>('/admin/create-user', 'Could not create the account', { body: { email: input.email, name: input.name, role: input.roles, ...(input.password && { password: input.password }) } })).user),

    setRoles: (userId: string, roles: string[]) => call<unknown>('/admin/set-role', 'Could not change the roles', { body: { userId, role: roles } }),

    /** Blocks signing in, which ends the person's sessions. */
    block: (userId: string) => call<unknown>('/admin/ban-user', 'Could not block the account', { body: { userId } }),

    unblock: (userId: string) => call<unknown>('/admin/unban-user', 'Could not unblock the account', { body: { userId } }),

    /** Invites an address without an account; the link comes back only when the server cannot email it. Inviting again sends a new link. */
    invite: async (input: { email: string; roles: string[] }) => sent(await call<RawInvitation>('/users/invite', 'Could not send the invitation', { body: input })),

    invitations: async () => (await call<{ invitations: RawInvitation[] }>('/users/invitations', 'Could not read the invitations')).invitations.map(invitation),

    revoke: (invitationId: string) => call<unknown>('/users/invitations/cancel', 'Could not revoke the invitation', { body: { id: invitationId } }),

    /** Every role with its label, to give. */
    roles: () => call<RoleLabel[]>('/users/roles', 'Could not read the roles'),
  }
}

export type UsersClient = ReturnType<typeof usersClient>
