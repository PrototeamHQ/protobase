import type { StatusTone } from '@protobase/schema'
import { cn } from '../lib/cn'

const colour = {
  neutral: 'bg-faint-foreground',
  info: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
} satisfies Record<StatusTone, string>

/** A record's status as a coloured dot; `pulse` animates a ring around it for states in progress (still under reduced motion). */
export const StatusDot = ({ tone, pulse = false, className }: { tone: StatusTone; pulse?: boolean; className?: string }) => (
  <span aria-hidden className={cn('relative flex size-2 shrink-0', className)} data-tone={tone} data-pulse={pulse || undefined}>
    {pulse && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:animate-none', colour[tone])} />}
    <span className={cn('relative size-2 rounded-full', colour[tone])} />
  </span>
)
