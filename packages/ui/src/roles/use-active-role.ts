import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import { AuthError, type ActiveRole } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { useAuth } from '../auth/auth-provider'
import { keys } from '../data/query-keys'
import { useToast } from '../toasts'
import { text } from './messages'

export type ActiveRoleState = {
  /** The role the session acts with and the roles to switch to, `undefined` while they load. */
  current?: ActiveRole
  /** Acts with another role, then starts the app again, as a switch of organization does. */
  switchTo: (name: string) => void
}

const failureMessage = (failure: unknown, fallback: string) => (failure instanceof AuthError ? authMessage(failure) : fallback)

/**
 * The role the session acts with, read while `enabled` (someone is signed in) as a query, so the start cache keeps it and
 * the app's first frame draws it; a failed read or switch shows as a toast.
 */
export const useActiveRole = (reopen: () => void, enabled = true): ActiveRoleState => {
  const { session } = useAuth()
  const toast = useToast()
  const role = useQuery({ queryKey: keys.activeRole, queryFn: () => session.roles.current(), enabled, retry: false })
  useEffect(() => {
    if (role.error) toast.show({ state: 'error', title: failureMessage(role.error, text('couldNotReadRoles')) })
  }, [role.error, toast])
  const switchTo = useCallback(
    (name: string) => void session.roles.switchTo(name).then(reopen, (failure: unknown) => toast.show({ state: 'error', title: failureMessage(failure, text('couldNotSwitch')) })),
    [session, toast, reopen],
  )
  return { ...(enabled && role.data && { current: role.data }), switchTo }
}
