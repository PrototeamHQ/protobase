import { Lock, X } from 'lucide-react'
import type { FilterChip } from './filter-state'

export type ActiveFilterChipsProps = {
  chips: FilterChip[]
  /** Chips that cannot be removed, for example a permission filter. */
  lockedLabels?: string[]
  onRemove: (key: string) => void
  onClear: () => void
  /** One horizontally scrollable line instead of wrapping, for phones. */
  scroll?: boolean
}

const chipClass = 'inline-flex h-6 items-center gap-1 rounded-full border border-primary-border bg-primary-soft pl-2.5 pr-1.5 text-xs font-medium text-primary-text'

export const ActiveFilterChips = ({ chips, lockedLabels = [], onRemove, onClear, scroll }: ActiveFilterChipsProps) => {
  if (chips.length === 0 && lockedLabels.length === 0) return null
  return (
    <div className={scroll ? 'flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1 [&>*]:shrink-0' : 'flex flex-wrap items-center gap-1.5'}>
      {lockedLabels.map((label) => (
        <span key={label} className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border-strong bg-muted px-2.5 text-xs font-medium text-foreground">
          <Lock className="size-3 text-muted-foreground" />
          {label}
        </span>
      ))}
      {chips.map((chip) => (
        <span key={chip.key} className={chipClass}>
          {chip.label}
          <button type="button" aria-label={`Remove ${chip.label}`} onClick={() => onRemove(chip.key)} className="rounded-full p-0.5 hover:bg-primary-border/60">
            <X className="size-3" />
          </button>
        </span>
      ))}
      {chips.length > 0 && (
        <button type="button" onClick={onClear} className="ml-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          Clear all
        </button>
      )}
    </div>
  )
}
