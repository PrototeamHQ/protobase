import { useQuery } from '@tanstack/react-query'
import type { OrganizationInvitation } from '@protobase/client'
import { useAuth } from '../auth/auth-provider'
import { keys } from '../data/query-keys'

export type MyInvitations = { state: 'loading' } | { state: 'failed'; retry: () => void } | { state: 'ready'; invitations: OrganizationInvitation[] }

/** The pending invitations for the signed-in person's own address, or that they could not be read, to try again. */
export const useMyInvitations = (): MyInvitations => {
  const { session } = useAuth()
  const query = useQuery({ queryKey: keys.myInvitations, queryFn: () => session.organizations.myInvitations(), retry: false })
  if (query.data) return { state: 'ready', invitations: query.data }
  if (query.isError) return { state: 'failed', retry: () => void query.refetch() }
  return { state: 'loading' }
}
