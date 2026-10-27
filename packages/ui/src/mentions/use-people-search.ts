import { useEffect, useRef, useState } from 'react'
import { useDebounced } from '../lib/use-debounced'
import type { PickedUser } from './mention-text'

/** Finds the people whose name matches the text typed after `@`, such as the members of a channel. */
export type PeopleSearch = (query: string) => Promise<readonly PickedUser[]>

type Found = { people: readonly PickedUser[] } | { failed: true }

/**
 * The people `search` finds for `query`, asked 150 ms after it last changed; `undefined` until the first answer and
 * while `query` is `undefined`. The last answer stays up while the next one is on its way, so the list does not flicker
 * as a name is typed, and an answer to a query since changed is dropped.
 */
export const usePeopleSearch = (search: PeopleSearch | undefined, query: string | undefined): Found | undefined => {
  const settled = useDebounced(query, 150)
  const [found, setFound] = useState<Found>()
  // The search the caller gave last, so one written inline does not ask again on every render
  const latest = useRef(search)
  latest.current = search
  useEffect(() => {
    const ask = latest.current
    if (settled === undefined || !ask) return
    let current = true
    ask(settled).then(
      (people) => current && setFound({ people }),
      () => current && setFound({ failed: true }),
    )
    return () => {
      current = false
    }
  }, [settled])
  return query === undefined ? undefined : found
}
