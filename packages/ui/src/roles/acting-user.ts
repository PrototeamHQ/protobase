import type { ActiveRole, AuthUser } from '@protobase/client'

/**
 * The signed-in user as the session acts: with the active role alone, as its tokens carry it, so what the shell shows
 * by role follows a switch. As signed in until the active role is read, or for someone without a role.
 */
export const actingUser = (user: AuthUser, role: ActiveRole | undefined): AuthUser => (role?.active ? { ...user, role: role.active } : user)
