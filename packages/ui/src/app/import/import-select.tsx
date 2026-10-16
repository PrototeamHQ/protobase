import { useId, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type ImportSelectOption = { value: string; label: string }

type ImportSelectProps = {
  label: string
  /** The select's name for assistive technology, when the visible label alone does not say which it is. */
  name?: string
  value: string
  options: ImportSelectOption[]
  onChange: (value: string) => void
  /** A line under the control. */
  help?: ReactNode
  className?: string
}

/** A labelled native select, as the field editors draw theirs. */
export const ImportSelect = ({ label, name, value, options, onChange, help, className }: ImportSelectProps) => {
  const id = useId()
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <select
        id={id}
        aria-label={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full min-w-0 rounded-md border border-border-strong bg-background px-2 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 max-sm:min-h-11"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  )
}
