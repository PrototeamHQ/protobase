import { enumLabel } from '@protobase/schema'
import { cn } from '../../lib/cn'
import type { FieldWidgetEditorProps, FieldWidgetProps } from '../field-types/field-widget'

/**
 * The bike shop's `steps` field type for stories, as a plugin would write it: an enum's value as its place among the
 * values, a dot per value filled up to it, and as buttons to move it.
 */
export const StepsDisplay = ({ field, value }: FieldWidgetProps<string>) => {
  const steps = field.enumValues ?? []
  const at = value === null ? -1 : steps.indexOf(value)
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`Step ${at + 1} of ${steps.length}: ${value === null ? 'none' : enumLabel(value)}`}>
      {steps.map((step, index) => (
        <span key={step} aria-hidden className={cn('size-2 rounded-full', index <= at ? 'bg-primary' : 'bg-border-strong')} />
      ))}
    </span>
  )
}

export const StepsEditor = ({ field, value, onChange }: FieldWidgetEditorProps<string>) => (
  <div role="radiogroup" aria-label={field.name} className="flex flex-wrap gap-1">
    {(field.enumValues ?? []).map((step) => (
      <button
        key={step}
        type="button"
        role="radio"
        aria-checked={step === value}
        onClick={() => onChange(step)}
        className={cn('rounded-md border px-2 py-1 text-xs', step === value ? 'border-primary bg-primary-soft text-primary-text' : 'border-border hover:bg-muted')}
      >
        {enumLabel(step)}
      </button>
    ))}
  </div>
)

/** A field type that throws while drawing, for the stories of its fallback. */
export const Broken = (): never => {
  throw new Error('Broken broke')
}
