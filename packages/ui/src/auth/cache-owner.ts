import type { AuthState } from './auth-provider'
import { signedInUserOf } from './use-signed-in-user'

/**
 * Whose answers the query cache holds: the signed-in user's id, or the state's kind for a visitor, each with a prefix of
 * its own so no user id can name a visitor's cache. Signing out to a visitor, or in as someone else, changes it, so
 * nobody sees what the previous caller was answered.
 */
export const cacheOwner = (state: AuthState) => {
  const user = signedInUserOf(state)
  if (user) return `user:${user.id}`
  return `state:${state.kind}`
}
