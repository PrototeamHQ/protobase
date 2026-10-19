import { useCallback, useEffect, useState } from 'react'
import { AuthError, type ActiveRole } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { useAuth } from '../auth/auth-provider'
import { useToast } from '../toasts'
import { text } from './messages'

export type ActiveRoleState = {
  /** The role the session acts with and the roles to switch to, `undefined` while they load. */
  current?: ActiveRole
  /** Acts with another role, then starts the app again, as a switch of organization does. */
  switchTo: (name: string) => void
}

const failureMessage = (failure: unknown, fallback: string) => (failure instanceof AuthError ? authMessage(failure) : fallback)

/** The role the session acts with, read while `enabled` (someone is signed in); a failed read or switch shows as a toast. */
export const useActiveRole = (reopen: () => void, enabled = true): ActiveRoleState => {
  const { session } = useAuth()
  const toast = useToast()
  const [current, setCurrent] = useState<ActiveRole>()
  useEffect(() => {
    if (!enabled) return
    void session.roles.current().then(setCurrent, (failure: unknown) => toast.show({ state: 'error', title: failureMessage(failure, text('couldNotReadRoles')) }))
  }, [session, toast, enabled])
  const switchTo = useCallback(
    (name: string) => void session.roles.switchTo(name).then(reopen, (failure: unknown) => toast.show({ state: 'error', title: failureMessage(failure, text('couldNotSwitch')) })),
    [session, toast, reopen],
  )
  return { ...(current && { current }), switchTo }
}
