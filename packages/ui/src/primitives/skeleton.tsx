import type { CSSProperties } from 'react'
import { cn } from '../lib/cn'

export const Skeleton = ({ className, style }: { className?: string; style?: CSSProperties }) => (
  <span className={cn('block h-3 rounded bg-muted [animation:pb-shimmer_1.4s_ease-in-out_infinite]', className)} style={style} />
)
