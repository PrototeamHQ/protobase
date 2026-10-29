import { useQuery } from '@tanstack/react-query'
import { useOptionalAuth } from '../auth/auth-provider'
import { useClient } from '../data/api-provider'
import { keys } from '../data/query-keys'
import { useMeta } from '../data/use-meta'

/**
 * How often a page reads the statuses again, over the connections it already has: another person's change, or a
 * status whose time has passed, shows within this, while the page is in view.
 */
export const statusRefreshMs = 15_000

// The signed-in person's id, when the app has status on.
const useStatusUser = () => {
  const auth = useOptionalAuth()
  const on = Boolean(useMeta().data?.status)
  return on && auth?.state.kind === 'signed-in' ? String(auth.state.user.id) : undefined
}

/**
 * The statuses of everyone who shares an organization with the signed-in person, their own included, as the server
 * holds them now: read again every `statusRefreshMs` while the page is in view, and on focus. Disabled, with no data,
 * in an app without `status: {}` and for a visitor.
 */
export const useStatuses = () => {
  const client = useClient()
  const userId = useStatusUser()
  return useQuery({ queryKey: keys.statuses(userId ?? ''), enabled: userId !== undefined, refetchInterval: statusRefreshMs, queryFn: () => client.status.people() })
}

/** The signed-in person's own status, `null` without one, read as `useStatuses` reads the others'. */
export const useOwnStatus = () => {
  const client = useClient()
  const userId = useStatusUser()
  return useQuery({ queryKey: keys.ownStatus(userId ?? ''), enabled: userId !== undefined, refetchInterval: statusRefreshMs, queryFn: () => client.status.own() })
}
