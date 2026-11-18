import { Skeleton } from '../primitives/skeleton'
import { text } from './messages'

/**
 * A list page while its code loads: its heading and its rows' area where the list page draws them, in the same padding,
 * so the list takes their place instead of pushing in.
 */
export const ListSkeleton = () => (
  <div role="status" aria-label={text('loading')} className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
    <Skeleton className="h-7 w-48" />
    <Skeleton className="h-9 w-full max-w-96" />
    <Skeleton className="min-h-60 flex-1 rounded-lg" />
  </div>
)
