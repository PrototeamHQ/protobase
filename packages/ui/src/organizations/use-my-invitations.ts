import { useQuery } from '@tanstack/react-query'
import { useContext } from 'react'
import type { OrganizationInvitation } from '@protobase/client'
import { useAuth } from '../auth/auth-provider'
import { keys } from '../data/query-keys'
import { ClientStartContext, isAnsweredNow, lastFetchFailed } from '../data/start-cache/restored-state'

export type MyInvitations = { state: 'loading' } | { state: 'failed'; retry: () => void } | { state: 'ready'; invitations: OrganizationInvitation[] }

/**
 * The pending invitations for the signed-in person's own address, as read in this page load, or that they could not be
 * read, to try again: the start cache's answer may predate an invitation, which an empty list would then hide.
 */
export const useMyInvitations = (): MyInvitations => {
  const { session } = useAuth()
  const startedAt = useContext(ClientStartContext)
  const query = useQuery({ queryKey: keys.myInvitations, queryFn: () => session.organizations.myInvitations(), retry: false })
  if (query.data && isAnsweredNow(query, startedAt)) return { state: 'ready', invitations: query.data }
  if (lastFetchFailed(query)) return { state: 'failed', retry: () => void query.refetch() }
  return { state: 'loading' }
}
