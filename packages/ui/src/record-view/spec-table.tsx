import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export type SpecRow = {
  label: string
  value: ReactNode
  /** A line under the label. */
  help?: string
  /** The value runs under its label across the row, as a text of several lines does. */
  wide?: boolean
}

/**
 * Label/value rows, the label on the left and the value on the right, as a property's features table on a real estate
 * site: what a record page's section shows on its read view. A wide row puts its value under the label.
 */
export const SpecTable = ({ rows }: { rows: SpecRow[] }) => (
  <dl className="border-t border-border text-[13px]">
    {rows.map((row) => (
      <div key={row.label} className={cn('grid gap-x-4 border-b border-border py-2.5', row.wide ? 'grid-cols-1 gap-y-1.5' : 'grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')}>
        <dt className="min-w-0 text-muted-foreground">
          {row.label}
          {row.help && <span className="mt-0.5 block text-xs text-faint-foreground">{row.help}</span>}
        </dt>
        <dd className="min-w-0 break-words text-foreground">{row.value}</dd>
      </div>
    ))}
  </dl>
)
