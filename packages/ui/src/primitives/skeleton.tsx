import { cn } from '../lib/cn'

export const Skeleton = ({ className }: { className?: string }) => (
  <span className={cn('block h-3 rounded bg-muted [animation:pb-shimmer_1.4s_ease-in-out_infinite]', className)} />
)
