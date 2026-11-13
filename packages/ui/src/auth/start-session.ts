import type { SetupStatus } from '@protobase/client'
import type { CachedSession } from '../data/start-cache/start-cache'
import type { AuthState } from './auth-state'

/** Whether the start cache keeps this caller: someone signed in as themselves, never a visitor or staff signed in as someone. */
export const keepsStartCache = (state: AuthState) => state.kind === 'signed-in' && !state.staff

/**
 * What the start cache does as the auth state changes: keeps the session of someone signed in as themselves, leaves
 * itself alone while the state is still loading or the server could not be asked, and forgets everything otherwise, as
 * signing out, a 401 and a visitor do.
 */
export const startCacheStep = (state: AuthState, status: SetupStatus | undefined): { save: CachedSession } | 'leave' | 'clear' => {
  if (state.kind === 'loading' || state.kind === 'error') return 'leave'
  if (state.kind !== 'signed-in' || !keepsStartCache(state)) return 'clear'
  return status ? { save: { user: state.user, status } } : 'leave'
}
