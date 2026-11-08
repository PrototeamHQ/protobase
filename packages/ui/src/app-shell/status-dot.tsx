import type { ReactNode } from 'react'
import type { StatusTone } from '@protobase/schema'
import { cn } from '../lib/cn'

const colour = {
  neutral: 'text-faint-foreground',
  info: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
} satisfies Record<StatusTone, string>

// A shape per tone, in a 10 by 10 box, so a status never rests on its colour alone: a ring, a diamond, a dot, a
// triangle and a square.
const shape = {
  neutral: <circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />,
  info: <path d="M5 0.8 9.2 5 5 9.2 0.8 5Z" fill="currentColor" />,
  success: <circle cx="5" cy="5" r="4" fill="currentColor" />,
  warning: <path d="M5 0.6 9.6 9H0.4Z" fill="currentColor" strokeLinejoin="round" />,
  danger: <rect x="1.2" y="1.2" width="7.6" height="7.6" rx="1" fill="currentColor" />,
} satisfies Record<StatusTone, ReactNode>

/**
 * A record's status as a mark of its tone's colour and shape: a ring for neutral, a diamond for info, a dot for success,
 * a triangle for warning and a square for danger. `pulse` animates a copy around it for states in progress (still under
 * reduced motion).
 */
export const StatusDot = ({ tone, pulse = false, className }: { tone: StatusTone; pulse?: boolean; className?: string }) => (
  <span aria-hidden className={cn('relative flex size-2.5 shrink-0', colour[tone], className)} data-tone={tone} data-pulse={pulse || undefined}>
    {pulse && (
      <svg viewBox="0 0 10 10" className="absolute inset-0 size-2.5 animate-ping opacity-60 motion-reduce:animate-none">
        {shape[tone]}
      </svg>
    )}
    <svg viewBox="0 0 10 10" className="relative size-2.5">
      {shape[tone]}
    </svg>
  </span>
)
