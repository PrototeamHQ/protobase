import { useMemo } from 'react'
import type { MailConnection, MailConnectionListing } from '@protobase/client'
import { useSenderRefresh, type ListingProblem } from './use-sender-refresh'

/**
 * The send-as address checks of the person's mailboxes: `providers` whose links can list them, which are read once when
 * the section opens and again on `refresh`, and why any could not be read (`notices`), one per provider: a link without
 * the scope to list them says so before any refresh, from the list itself.
 */
export const useMailboxListing = (connections: MailConnection[], onRefresh: () => Promise<MailConnectionListing[]>) => {
  const listing = connections.filter((connection) => connection.canList)
  const ready = listing.filter((connection) => connection.missingScopes.length === 0).map((connection) => connection.provider)
  const providers = useMemo(() => [...new Set(ready)], [ready.join()])
  const { refreshing, problems, checked, refresh } = useSenderRefresh(onRefresh, providers.length > 0, providers)
  const missing = [...new Set(listing.filter((connection) => connection.missingScopes.length > 0).map((connection) => connection.provider))]
  const notices: ListingProblem[] = [...missing.map((provider) => ({ provider, kind: 'not_permitted' as const })), ...problems.filter((problem) => !missing.includes(problem.provider))]
  return { providers, refreshing, checked, refresh, notices }
}

export type MailboxListing = ReturnType<typeof useMailboxListing>
