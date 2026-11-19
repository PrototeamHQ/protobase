import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { AuthError, type CurrentOrganization, type Organization } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { useAuth } from '../auth/auth-provider'
import { keys } from '../data/query-keys'
import { text } from './messages'

export type OrganizationsState = {
  /** The organization the session works in, `undefined` while it loads. */
  current?: CurrentOrganization
  /** The person's organizations. */
  organizations: Organization[]
  error?: string
  reload: () => void
}

const none: Organization[] = []

/**
 * The current organization and the person's organizations, read again with `reload` after a change; a query, so the
 * start cache keeps them and the app's first frame draws them.
 */
export const useOrganizations = (enabled: boolean): OrganizationsState => {
  const { session } = useAuth()
  const query = useQuery({
    queryKey: keys.organizations,
    queryFn: async () => {
      const [current, organizations] = await Promise.all([session.organizations.current(), session.organizations.list()])
      return { current, organizations }
    },
    enabled,
    retry: false,
  })
  const { refetch } = query
  const reload = useCallback(() => void refetch(), [refetch])
  const data = enabled ? query.data : undefined
  const error = enabled && query.error ? (query.error instanceof AuthError ? authMessage(query.error) : text('couldNotReadOrganizations')) : undefined
  return { current: data?.current, organizations: data?.organizations ?? none, ...(error && { error }), reload }
}

/**
 * Starts the app again in another organization: what it shows, the menu included, follows from the roles there, so it
 * loads afresh rather than keeping what it read for the last one.
 */
export const reopenIn = (basePath: string) => window.location.assign(`${basePath}/`)
