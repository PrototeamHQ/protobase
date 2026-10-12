import type { ComponentType } from 'react'
import { cn } from '../lib/cn'

export type SegmentedOption<T extends string> = { value: T; label: string; icon?: ComponentType<{ className?: string }> }

/** `md` matches a medium Button, for a switch that sits among buttons. */
export type SegmentedProps<T extends string> = { value: T; options: Array<SegmentedOption<T>>; onChange: (value: T) => void; label?: string; size?: 'sm' | 'md' }

const sizes = { sm: { group: 'h-7', option: 'px-2.5 text-xs' }, md: { group: 'h-8', option: 'px-3 text-[13px]' } }

export const Segmented = <T extends string>({ value, options, onChange, label, size = 'sm' }: SegmentedProps<T>) => (
  <span role="group" aria-label={label} className={cn('inline-flex', sizes[size].group, 'rounded-md bg-muted p-0.5')}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        aria-pressed={option.value === value}
        onClick={() => onChange(option.value)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded',
          sizes[size].option,
          'font-medium transition-colors',
          option.value === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {option.icon && <option.icon className="size-3.5" />}
        {option.label}
      </button>
    ))}
  </span>
)
