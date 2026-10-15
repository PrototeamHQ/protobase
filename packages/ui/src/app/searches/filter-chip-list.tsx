import type { FilterChip } from '../../filter-panel'
import { cn } from '../../lib/cn'

const chipClass = 'inline-flex h-6 items-center rounded-full border border-primary-border bg-primary-soft px-2.5 text-xs font-medium text-primary-text'

/** What a filter filters on, concisely: its chips as a list labelled "Filters". */
export const FilterChipList = ({ chips, className }: { chips: readonly FilterChip[]; className?: string }) => (
  <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label="Filters">
    {chips.map((chip) => (
      <li key={chip.key} className={chipClass}>
        {chip.label}
      </li>
    ))}
  </ul>
)

/** A filter's chips inside a heading or a link, where a list cannot go: read out one after the other. */
export const InlineFilterChips = ({ chips }: { chips: readonly FilterChip[] }) => (
  <span className="flex flex-wrap gap-1.5">
    {chips.map((chip, index) => (
      <span key={chip.key} className={chipClass}>
        {index > 0 && <span className="sr-only">, </span>}
        {chip.label}
      </span>
    ))}
  </span>
)

/** A search without a name as words, for a label or a question: its chips one after the other. */
export const chipsText = (chips: readonly FilterChip[]) => chips.map((chip) => chip.label).join(', ')
