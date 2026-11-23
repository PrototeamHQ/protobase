import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthError, type MailConnectionListing } from '@protobase/client'

/** Why a refresh read no addresses of a connection: its link lacks the scope, no longer works, or the listing failed. */
export type ListingProblem = { provider: string; kind: 'not_permitted' | 'expired' | 'failed' }

const problemOf = (listing: MailConnectionListing): ListingProblem | undefined => {
  if (listing.status === 'not_permitted') return { provider: listing.provider, kind: 'not_permitted' }
  if (listing.status === 'error') return { provider: listing.provider, kind: listing.code === 'link_expired' ? 'expired' : 'failed' }
  return
}

/**
 * Reads the person's send-as addresses from their mailboxes once when the section opens, when `canRefresh`, and again
 * on `refresh`: `refreshing` while it runs, each connection's `problems` from the last run, and `checked` when it
 * found none. A run that fails as a
 * whole, as when the connection drops, counts as a failed listing of each provider in `providers`.
 */
export const useSenderRefresh = (onRefresh: () => Promise<MailConnectionListing[]>, canRefresh: boolean, providers: string[]) => {
  const [refreshing, setRefreshing] = useState(false)
  const [problems, setProblems] = useState<ListingProblem[]>([])
  // Whether the last run read every connection it could, for the section to say so.
  const [checked, setChecked] = useState(false)
  const running = useRef(false)
  const refresh = useCallback(async () => {
    if (running.current) return
    running.current = true
    setRefreshing(true)
    try {
      const found = (await onRefresh()).flatMap((listing) => problemOf(listing) ?? [])
      setProblems(found)
      setChecked(found.length === 0)
    } catch (failure) {
      // The browser's fetch rejects with a TypeError when the connection fails.
      if (!(failure instanceof AuthError) && !(failure instanceof TypeError)) throw failure
      setProblems(providers.map((provider) => ({ provider, kind: 'failed' })))
      setChecked(false)
    } finally {
      running.current = false
      setRefreshing(false)
    }
  }, [onRefresh, providers])
  const opened = useRef(false)
  useEffect(() => {
    if (!canRefresh || opened.current) return
    opened.current = true
    void refresh()
  }, [canRefresh, refresh])
  return { refreshing, problems, checked, refresh }
}
