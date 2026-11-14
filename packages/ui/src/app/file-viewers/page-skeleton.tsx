import { Skeleton } from '../../primitives/skeleton'

/** What a file's page shows while its viewer or its file is read: a heading and a block. */
export const PageSkeleton = () => (
  <div className="space-y-3 px-4 py-6 md:px-10">
    <Skeleton className="h-6 w-2/3" />
    <Skeleton className="h-40" />
  </div>
)
