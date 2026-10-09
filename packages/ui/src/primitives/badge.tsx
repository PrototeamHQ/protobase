import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export type BadgeTone = 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'violet'

const tones = {
  neutral: 'bg-muted text-muted-foreground',
  blue: 'bg-primary-soft text-primary-text',
  green: 'bg-success-soft text-success-text',
  amber: 'bg-warning-soft text-warning-text',
  red: 'bg-danger-soft text-danger-text',
  violet: 'bg-violet-soft text-violet-text',
}

const dots = {
  neutral: 'bg-faint-foreground',
  blue: 'bg-primary',
  green: 'bg-success',
  amber: 'bg-warning',
  red: 'bg-danger',
  violet: 'bg-violet',
}

export const Badge = ({ tone = 'neutral', dot = true, children, className }: { tone?: BadgeTone; dot?: boolean; children: ReactNode; className?: string }) => (
  <span className={cn('inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap', tones[tone], className)}>
    {dot && <span className={cn('size-1.5 rounded-full', dots[tone])} />}
    {children}
  </span>
)
