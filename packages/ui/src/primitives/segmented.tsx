import type { ComponentType } from 'react'
import { cn } from '../lib/cn'

export type SegmentedOption<T extends string> = { value: T; label: string; icon?: ComponentType<{ className?: string }> }

export type SegmentedProps<T extends string> = { value: T; options: Array<SegmentedOption<T>>; onChange: (value: T) => void; label?: string }

export const Segmented = <T extends string>({ value, options, onChange, label }: SegmentedProps<T>) => (
  <span role="group" aria-label={label} className="inline-flex h-7 rounded-md bg-muted p-0.5">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        aria-pressed={option.value === value}
        onClick={() => onChange(option.value)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors',
          option.value === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {option.icon && <option.icon className="size-3.5" />}
        {option.label}
      </button>
    ))}
  </span>
)
