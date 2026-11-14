import { Skeleton } from '../../primitives/skeleton'
import { text } from './messages'

/** What a file's page shows while its viewer or its file is read: a heading and a block, named for screen readers. */
export const PageSkeleton = ({ name }: { name: string }) => (
  <div className="space-y-3 px-4 py-6 md:px-10" aria-busy="true">
    <span role="status" className="sr-only">
      {text('loading', { name })}
    </span>
    <Skeleton className="h-6 w-2/3" />
    <Skeleton className="h-40" />
  </div>
)
