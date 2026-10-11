import type { Session } from './types'

/**
 * The one role a session works as, which picks its bottom bar: the first of its roles. A Better Auth token carries the
 * session's active role alone (see `narrowClaims`); with another authenticator, the caller's first role.
 */
export const activeRole = (session: Session): string | undefined => session.user.roles[0]
