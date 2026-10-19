import { useEffect, useState } from 'react'
import { AuthError, type RoleLabel } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { useAuth } from '../auth/auth-provider'

/** Every role an admin can give, with its label, read once; `error` says why they could not be read. */
export const useUserRoles = () => {
  const { session } = useAuth()
  const [roles, setRoles] = useState<RoleLabel[]>([])
  const [error, setError] = useState<string>()
  useEffect(() => {
    void session.users.roles().then(setRoles, (failure: unknown) => setError(failure instanceof AuthError ? authMessage(failure) : 'Could not read the roles'))
  }, [session])
  return { roles, error }
}
