import type { CSSProperties } from 'react'
import { cn } from '../lib/cn'

/**
 * A placeholder shaped like what is loading, which keeps that content's room. It stays blank for its first 180 ms, so a
 * load that quick shows no flash, then shimmers, or stays still when less motion is asked for.
 */
export const Skeleton = ({ className, style }: { className?: string; style?: CSSProperties }) => (
  <span className={cn('block h-3 rounded bg-muted', skeletonMotion, className)} style={style} />
)

/** Blank for the first 180 ms, for a loading notice such as a spinner, so a quick load never flashes it. */
export const revealLate = '[animation:pb-reveal_1ms_180ms_backwards]'

const skeletonMotion = '[animation:pb-reveal_1ms_180ms_backwards,pb-shimmer_1.4s_180ms_ease-in-out_infinite] motion-reduce:[animation:pb-reveal_1ms_180ms_backwards]'
