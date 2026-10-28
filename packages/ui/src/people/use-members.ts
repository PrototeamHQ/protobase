import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import type { OrganizationPerson } from '@protobase/client'
import { useOptionalAuth } from '../auth/auth-provider'
import { keys } from '../data/query-keys'

/** How old the list must be before an id it lacks, such as a newcomer's, reads it again. */
export const unknownIdRefetchMs = 10_000

/** Whether an id the list lacks reads it again: once it has loaded, is not being read, and is old enough. */
export const asksAgainFor = (query: { isSuccess: boolean; isFetching: boolean; dataUpdatedAt: number }, now = Date.now()) =>
  query.isSuccess && !query.isFetching && now - query.dataUpdatedAt >= unknownIdRefetchMs

export type MembersResult = UseQueryResult<OrganizationPerson[]> & {
  /** The member with this user id; an unknown one reads the list again (see `asksAgainFor`). */
  member: (id: string) => OrganizationPerson | undefined
}

/**
 * The members of the organization the session works in, as `{ id, name, image? }` with `id` the user id that
 * `.author()` stores and mentions hold, by name, readable by every member and without addresses. Read again on focus
 * once 30 s old, and when `member` is asked for an id it lacks. Without organizations or the app's auth it fails
 * saying so.
 */
export const useMembers = (): MembersResult => {
  const auth = useOptionalAuth()
  const user = auth?.state.kind === 'signed-in' ? auth.state.user : undefined
  const query = useQuery({
    queryKey: keys.members(user?.id ?? ''),
    enabled: user !== undefined,
    queryFn: () => {
      if (!auth?.organizations) throw new Error('useMembers() needs organizations: turn them on in the auth config.')
      return auth.session.organizations.people()
    },
  })
  const byId = useMemo(() => new Map((query.data ?? []).map((person) => [person.id, person])), [query.data])
  const { refetch } = query
  const member = useCallback(
    (id: string) => {
      const found = byId.get(id)
      // After this render, as a render must not change another component's state
      if (!found && asksAgainFor(query)) setTimeout(() => void refetch(), 0)
      return found
    },
    [byId, query, refetch],
  )
  return { ...query, member }
}
