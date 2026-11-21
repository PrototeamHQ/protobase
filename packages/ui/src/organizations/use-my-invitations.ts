import { useQuery } from '@tanstack/react-query'
import type { OrganizationInvitation } from '@protobase/client'
import { useAuth } from '../auth/auth-provider'
import { keys } from '../data/query-keys'

const none: OrganizationInvitation[] = []

/** The pending invitations for the signed-in person's own address; `undefined` while they load. A failed read lists none. */
export const useMyInvitations = (): OrganizationInvitation[] | undefined => {
  const { session } = useAuth()
  const query = useQuery({ queryKey: keys.myInvitations, queryFn: () => session.organizations.myInvitations(), retry: false })
  if (query.isError) return none
  return query.data
}
