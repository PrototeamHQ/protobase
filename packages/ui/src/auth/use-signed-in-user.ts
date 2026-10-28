import { useMemo } from 'react'
import { useOptionalAuth, type AuthState } from './auth-provider'

/** Who is signed in: their user id, the id `.author()` stores and mentions hold, and their name. */
export type SignedInUser = { id: string; name?: string }

/** The signed-in person of an auth state; none while it loads, for a visitor, and before the sign-in finished. */
export const signedInUserOf = (state: AuthState | undefined): SignedInUser | undefined => {
  if (state?.kind !== 'signed-in') return
  const { id, name } = state.user
  return { id, ...(name && { name }) }
}

/**
 * The signed-in person, from the session the app already holds, such as for a filter on their own user id;
 * `undefined` while the session loads, for a visitor and when nobody is signed in.
 */
export const useSignedInUser = (): SignedInUser | undefined => {
  const state = useOptionalAuth()?.state
  return useMemo(() => signedInUserOf(state), [state])
}
