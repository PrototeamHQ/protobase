import { useCallback, useEffect, useState } from 'react'
import { AuthError, type CurrentOrganization, type Organization } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { useAuth } from '../auth/auth-provider'

export type OrganizationsState = {
  /** The organization the session works in, `undefined` while it loads. */
  current?: CurrentOrganization
  /** The person's organizations. */
  organizations: Organization[]
  error?: string
  reload: () => void
}

/** The current organization and the person's organizations, read again with `reload` after a change. */
export const useOrganizations = (enabled: boolean): OrganizationsState => {
  const { session } = useAuth()
  const [current, setCurrent] = useState<CurrentOrganization>()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [error, setError] = useState<string>()
  const [round, setRound] = useState(0)
  const reload = useCallback(() => setRound((value) => value + 1), [])
  useEffect(() => {
    if (!enabled) return
    void Promise.all([session.organizations.current(), session.organizations.list()]).then(
      ([currentOrganization, list]) => {
        setCurrent(currentOrganization)
        setOrganizations(list)
      },
      (failure: unknown) => setError(failure instanceof AuthError ? authMessage(failure) : 'Could not read your organizations'),
    )
  }, [enabled, session, round])
  return { current, organizations, ...(error && { error }), reload }
}

/**
 * Starts the app again in another organization: what it shows, the menu included, follows from the roles there, so it
 * loads afresh rather than keeping what it read for the last one.
 */
export const reopenIn = (basePath: string) => window.location.assign(`${basePath}/`)
