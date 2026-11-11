import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Skeleton } from '../primitives/skeleton'
import { text } from './messages'

/** How long a page waits at most for its first data before it shows what it has. */
export const revealWaitMs = 2000

/**
 * Draws a page out of sight until the data it asks for when it opens has come, with a skeleton over it meanwhile, so its
 * parts appear together where they stay instead of each moving the others as it loads. Data asked for in turn, such as
 * a band shown only when a count has come, is waited for too. It shows what it has after `revealWaitMs` at most, and
 * once shown it stays shown: later loads draw in place.
 */
export const RevealWhenLoaded = ({ children }: { children: ReactNode }) => {
  const client = useQueryClient()
  const fetching = useIsFetching()
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (shown) return
    const latest = setTimeout(() => setShown(true), revealWaitMs)
    return () => clearTimeout(latest)
  }, [shown])

  // The count the hook gives lags the queries the page's parts start as they mount, so the live count decides
  useEffect(() => {
    if (shown || fetching > 0) return
    const settled = setTimeout(() => client.isFetching() === 0 && setShown(true), 0)
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

const PageSkeleton = () => (
  <div role="status" aria-label={text('loading')} className="absolute inset-x-0 top-0 flex flex-col gap-4 p-4 md:p-6">
    <Skeleton className="h-6 w-48" />
    <Skeleton className="h-24" />
    <Skeleton className="h-40" />
    <Skeleton className="h-40" />
  </div>
)
