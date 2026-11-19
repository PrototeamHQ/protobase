import { useIsFetching, useQueryClient, type Query } from '@tanstack/react-query'
import { useContext, useEffect, useState, type ReactNode } from 'react'
import { ClientStartContext, isRestored } from '../data/start-cache/restored-state'
import { cn } from '../lib/cn'
import { Skeleton } from '../primitives/skeleton'
import { text } from './messages'

/** How long a page waits at most for its first data before it shows what it has. */
export const revealWaitMs = 2000

// A query on screen that already holds an answer, such as one from the start cache, draws it while it is fetched again;
// what such a refetch asks for in turn without showing it is not waited for either
const firstLoad = { type: 'active' as const, predicate: (query: Query) => query.state.data === undefined }

/**
 * Whether the page is the one the app starts with from the start cache: the client holds restored answers and has
 * fetched nothing of its own yet. A page opened later waits for its data as before.
 */
export const startsFromCache = (queries: readonly Pick<Query, 'state'>[], startedAt: number) =>
  queries.some((query) => isRestored(query.state, startedAt)) && !queries.some((query) => query.state.dataUpdatedAt >= startedAt)

/**
 * Draws a page out of sight until the data it asks for when it opens has come, with a skeleton over it meanwhile, so its
 * parts appear together where they stay instead of each moving the others as it loads. Data asked for in turn, such as
 * a band shown only when a count has come, is waited for too. It shows what it has after `revealWaitMs` at most, and
 * once shown it stays shown: later loads draw in place. Data the page already holds is not waited for, and a page the
 * app starts with from the start cache is shown in its first frame, drawn from what the cache holds.
 */
export const RevealWhenLoaded = ({ children }: { children: ReactNode }) => {
  const client = useQueryClient()
  const startedAt = useContext(ClientStartContext)
  const fetching = useIsFetching(firstLoad)
  const [shown, setShown] = useState(() => startsFromCache(client.getQueryCache().getAll(), startedAt))

  useEffect(() => {
    if (shown) return
    const latest = setTimeout(() => setShown(true), revealWaitMs)
    return () => clearTimeout(latest)
  }, [shown])

  // The count the hook gives lags the queries the page's parts start as they mount, so the live count decides
  useEffect(() => {
    if (shown || fetching > 0) return
    const settled = setTimeout(() => client.isFetching(firstLoad) === 0 && setShown(true), 0)
    return () => clearTimeout(settled)
  }, [shown, fetching, client])

  // The same elements shown or not, so showing the page keeps what it drew; each passes on the page's room as `main` does
  return (
    <div className="relative flex min-h-0 flex-1 flex-col" aria-busy={shown ? undefined : true}>
      <div className={cn('flex min-h-0 flex-1 flex-col', !shown && 'invisible')}>{children}</div>
      {!shown && <PageSkeleton />}
    </div>
  )
}

/** A page's skeleton where it draws, for a page whose code is still loading. */
export const RevealSkeleton = () => (
  <div className="relative flex min-h-0 flex-1 flex-col">
    <PageSkeleton />
  </div>
)

const PageSkeleton = () => (
  <div role="status" aria-label={text('loading')} className="absolute inset-x-0 top-0 flex flex-col gap-4 p-4 md:p-6">
    <Skeleton className="h-6 w-48" />
    <Skeleton className="h-24" />
    <Skeleton className="h-40" />
    <Skeleton className="h-40" />
  </div>
)
