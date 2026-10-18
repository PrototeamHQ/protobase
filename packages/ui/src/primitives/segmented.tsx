import type { ComponentType } from 'react'
import { cn } from '../lib/cn'

export type SegmentedOption<T extends string> = { value: T; label: string; icon?: ComponentType<{ className?: string }> }

/**
 * `md` matches a medium Button, for a switch that sits among buttons. `iconOnly` draws each option as its icon alone,
 * its label the button's name, for a row without room for the words.
 */
export type SegmentedProps<T extends string> = { value: T; options: Array<SegmentedOption<T>>; onChange: (value: T) => void; label?: string; size?: 'sm' | 'md'; iconOnly?: boolean }

const sizes = { sm: { group: 'h-7', option: 'px-2.5 text-xs' }, md: { group: 'h-8', option: 'px-3 text-body' } }

/** A segmented switch's classes, for a row of links that looks like one: the group, and each option, `active` the chosen. */
export const segmentedClass = {
  group: (size: 'sm' | 'md' = 'sm') => cn('inline-flex', sizes[size].group, 'rounded-md bg-muted p-0.5'),
  option: (active: boolean, size: 'sm' | 'md' = 'sm') =>
    cn('inline-flex items-center gap-1.5 rounded', sizes[size].option, 'font-medium transition-colors', active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'),
}

export const Segmented = <T extends string>({ value, options, onChange, label, size = 'sm', iconOnly = false }: SegmentedProps<T>) => (
  <span role="group" aria-label={label} className={segmentedClass.group(size)}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        aria-pressed={option.value === value}
        {...(iconOnly && { 'aria-label': option.label, title: option.label })}
        onClick={() => onChange(option.value)}
        className={segmentedClass.option(option.value === value, size)}
      >
        {option.icon && <option.icon className="size-3.5" />}
        {!iconOnly && option.label}
      </button>
    ))}
  </span>
)
