import type { AuthState } from './auth-provider'
import { signedInUserOf } from './use-signed-in-user'

/**
 * Whose answers the query cache holds: the signed-in user's id, or the state's kind for a visitor. Signing out to a
 * visitor, or in as someone else, changes it, so nobody sees what the previous caller was answered.
 */
export const cacheOwner = (state: AuthState) => signedInUserOf(state)?.id ?? state.kind
