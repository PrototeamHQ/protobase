import { Switch } from '../primitives/switch'
import { Input } from '../primitives/input'
import { cn } from '../lib/cn'
import { Link } from './router'
import { enumLabel, type FieldModel, type FieldViewModel, type ResourceModel, type ViewModel } from '@protobase/schema'
import { RelationPicker } from './relation-picker'
import { SensitiveField } from './sensitive-field'
import { displayValue } from '../live/display-value'
import { isEditable } from '../live/field-values'

export type FieldEditorProps = {
  field: FieldModel
  hints?: FieldViewModel
  /** Draft text, or a boolean for boolean fields. */
  value: unknown
  /** The stored value, for read-only display. */
  stored: unknown
  /** The name of the record a relation points at. */
  relationLabel?: string
  /** Where a relation value leads, relative to the app's base path. */
  relationHref?: string
  /** On the create form a relation is chosen; on the record page it is shown as a link. */
  relationPicker?: { target: ResourceModel; view: ViewModel | undefined }
  invalid?: boolean
  /** The user may not change this record: show values, not inputs. */
  locked?: boolean
  placeholder?: string
  /** For a sensitive field of a stored record: fetches its value, which the record does not carry. */
  reveal?: () => Promise<unknown>
  onChange: (value: unknown) => void
}

const numeric = new Set(['integer', 'bigint', 'decimal'])

export const FieldEditor = ({ field, hints, value, stored, relationLabel, relationHref, relationPicker, invalid, locked, placeholder, reveal, onChange }: FieldEditorProps) => {
  if (field.sensitive) return <SensitiveField field={field} hints={hints} value={value} reveal={reveal} locked={locked || field.readOnly} invalid={invalid} placeholder={placeholder} onChange={onChange} />
  if (field.type === 'relation' && relationPicker && !field.readOnly) {
    return <RelationPicker target={relationPicker.target} view={relationPicker.view} value={String(value)} label={relationLabel} invalid={invalid} onChange={(next, label) => onChange({ key: next, label })} />
  }
  if (field.type === 'boolean' && locked) return <div className="py-1.5 text-[13px] text-muted-foreground">{displayValue(field, stored, hints)}</div>
  if (field.type === 'boolean') return <Switch checked={Boolean(value)} onChange={onChange} label={field.name} />
  if (field.type === 'relation') {
    const label = relationLabel ?? String(stored ?? '—')
    return <div className="py-1.5 text-[13px]">{relationHref ? <Link to={relationHref} className="font-medium text-primary-text hover:underline">{label}</Link> : label}</div>
  }
  if (!isEditable(field) || locked) return <div className={cn('py-1.5 text-[13px] tabular-nums', field.type === 'decimal' || field.type === 'integer' ? 'font-medium' : 'text-muted-foreground')}>{displayValue(field, stored, hints)}</div>
  if (field.type === 'enum') {
    return (
      <select
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full rounded-md border border-border-strong bg-background px-2 text-[13px] shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        {value === '' && <option value="">Choose...</option>}
        {(field.enumValues ?? []).map((option) => (
          <option key={option} value={option}>
            {enumLabel(option, hints?.valueLabels)}
          </option>
        ))}
      </select>
    )
  }
  return (
    <Input
      invalid={invalid}
      leading={hints?.prefix ? <span className="text-[13px]">{hints.prefix}</span> : undefined}
      placeholder={placeholder}
      className={cn(numeric.has(field.type) && 'text-right tabular-nums')}
      value={String(value)}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}
