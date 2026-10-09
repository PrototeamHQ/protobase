import { cn } from '../lib/cn'

export type SegmentedProps<T extends string> = { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }

export const Segmented = <T extends string>({ value, options, onChange }: SegmentedProps<T>) => (
  <span className="inline-flex h-7 rounded-md bg-muted p-0.5">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        onClick={() => onChange(option.value)}
        className={cn(
          'rounded px-2.5 text-xs font-medium transition-colors',
          option.value === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {option.label}
      </button>
    ))}
  </span>
)
