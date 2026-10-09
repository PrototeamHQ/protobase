import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export const Tooltip = ({ label, side = 'right', visible, children }: { label: string; side?: 'right' | 'top' | 'bottom'; visible?: boolean; children: ReactNode }) => (
  <span className="group/tooltip relative inline-flex">
    {children}
    <span
      role="tooltip"
      className={cn(
        'pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-md transition-opacity group-hover/tooltip:opacity-100',
        visible && 'opacity-100',
        side === 'right' && 'left-full top-1/2 ml-2 -translate-y-1/2',
        side === 'top' && 'bottom-full left-1/2 mb-2 -translate-x-1/2',
        side === 'bottom' && 'left-1/2 top-full mt-2 -translate-x-1/2',
      )}
    >
      {label}
    </span>
  </span>
)
