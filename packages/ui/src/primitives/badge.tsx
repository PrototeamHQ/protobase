import type { ReactNode } from 'react'
import type { BadgeTone } from '@protobase/schema'
import { cn } from '../lib/cn'
import { readableOn } from '../lib/readable-text'

export type { BadgeTone }

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  blue: 'bg-primary-soft text-primary-text',
  green: 'bg-success-soft text-success-text',
  amber: 'bg-warning-soft text-warning-text',
  red: 'bg-danger-soft text-danger-text',
  violet: 'bg-violet-soft text-violet-text',
}

/** The dot of a badge in each tone, for a status drawn as a dot alone. */
export const toneDots: Record<BadgeTone, string> = {
  neutral: 'bg-faint-foreground',
  blue: 'bg-primary',
  green: 'bg-success',
  amber: 'bg-warning',
  red: 'bg-danger',
  violet: 'bg-violet',
}

// An arrow pointing right, its point as deep as half the badge is high.
const arrow = 'polygon(0 0, calc(100% - 0.625rem) 0, 100% 50%, calc(100% - 0.625rem) 100%, 0 100%)'

type BadgeProps = {
  tone?: BadgeTone
  dot?: boolean
  /** A hex colour that fills the badge instead of its tone, its text white or near black, whichever reads. */
  color?: string
  /** `arrow` points the badge right, as on a rating scale. */
  shape?: 'arrow'
  children: ReactNode
  className?: string
}

export const Badge = ({ tone = 'neutral', dot = true, color, shape, children, className }: BadgeProps) => (
  <span
    style={{ ...(color !== undefined && { backgroundColor: color, color: readableOn(color) }), ...(shape === 'arrow' && { clipPath: arrow }) }}
    className={cn(
      shape === 'arrow' ? 'inline-flex h-5 items-center gap-1.5 rounded-l-sm pr-4 pl-2 text-xs font-semibold whitespace-nowrap' : 'inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap',
      color === undefined && tones[tone],
      className,
    )}
  >
    {dot && color === undefined && shape === undefined && <span className={cn('size-1.5 rounded-full', toneDots[tone])} />}
    {children}
  </span>
)
