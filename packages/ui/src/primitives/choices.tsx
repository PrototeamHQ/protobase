import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export type ChoiceOption<T extends string> = { value: T; label: string; description?: ReactNode; disabled?: boolean }

/**
 * `name` groups the radio buttons, so that the arrow keys move between them; `label` names the group for screen
 * readers. A disabled option shows and cannot be chosen.
 */
export type ChoicesProps<T extends string> = { name: string; label?: string; options: Array<ChoiceOption<T>>; value: T | undefined; onChange: (value: T) => void }

/** One of a few options, each a card of its own row with a line that says what it means; the chosen one is outlined. */
export const Choices = <T extends string>({ name, label, options, value, onChange }: ChoicesProps<T>) => (
  <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
    {options.map((option) => (
      <label
        key={option.value}
        className={cn(
          'block rounded-lg border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
          option.disabled ? 'cursor-default bg-background opacity-60' : option.value === value ? 'cursor-pointer border-primary bg-primary-soft' : 'cursor-pointer bg-background hover:bg-surface',
        )}
      >
        <input type="radio" name={name} value={option.value} checked={option.value === value} disabled={option.disabled} onChange={() => onChange(option.value)} className="sr-only" />
        <span className={cn('block font-medium', option.value === value && 'text-primary-text')}>{option.label}</span>
        {option.description && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{option.description}</span>}
      </label>
    ))}
  </div>
)
