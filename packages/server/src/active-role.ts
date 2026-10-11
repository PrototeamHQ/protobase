import type { Session } from './types'

/**
 * The one role a session works as, which picks its bottom bar. Sessions do not carry an active role yet, so it is the
 * default: the person's first role.
 */
export const activeRole = (session: Session): string | undefined => session.user.roles[0]
