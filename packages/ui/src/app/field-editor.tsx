import { Switch } from '../primitives/switch'
import { Input } from '../primitives/input'
import { Textarea } from '../primitives/textarea'
import { cn } from '../lib/cn'
import { AppLink } from './use-app-address'
import { enumLabel, type AppAddress, type FieldModel, type FieldViewModel, type ResourceModel, type ViewModel } from '@protobase/schema'
import { RelationPicker } from './relation-picker'
import { SensitiveField } from './sensitive-field'
import { FileField } from './file-field'
import { displayValue } from '../live/display-value'
import { fromDraft, isEditable, toFieldDraft } from '../live/field-values'
import { useShownWidget } from './field-types/shown-widget'
import { WidgetPart } from './field-types/widget-part'

export type FieldEditorProps = {
  field: FieldModel
  hints?: FieldViewModel
  /** Draft text, or a boolean for boolean fields. */
  value: unknown
  /** The stored value, for read-only display. */
  stored: unknown
  /** The name of the record a relation points at. */
  relationLabel?: string
  /** The record a relation value leads to. */
  relationTo?: AppAddress
  /** On the create form a relation is chosen; on the record page it is shown as a link. */
  relationPicker?: { target: ResourceModel; view: ViewModel | undefined }
  invalid?: boolean
  /** The user may not change this record: show values, not inputs. */
  locked?: boolean
  placeholder?: string
  /** For a sensitive field of a stored record: fetches its value, which the record does not carry. */
  reveal?: () => Promise<unknown>
  /** The resource the field belongs to: a file field uploads to it. */
  resource?: string
  onChange: (value: unknown) => void
}

const numeric = new Set(['integer', 'bigint', 'decimal'])

const BuiltInEditor = ({ field, hints, value, stored, relationLabel, relationTo, relationPicker, invalid, locked, placeholder, reveal, resource, onChange }: FieldEditorProps) => {
  if (field.type === 'file') return <FileField field={field} hints={hints} resource={resource ?? ''} value={value} locked={locked || !resource} invalid={invalid} onChange={onChange} />
  if (field.sensitive) return <SensitiveField field={field} hints={hints} value={value} reveal={reveal} locked={locked || field.readOnly} invalid={invalid} placeholder={placeholder} onChange={onChange} />
  if (field.type === 'relation' && relationPicker && !field.readOnly) {
    return <RelationPicker target={relationPicker.target} view={relationPicker.view} value={String(value)} label={relationLabel} invalid={invalid} onChange={(next, label) => onChange({ key: next, label })} />
  }
  if (field.type === 'boolean' && locked) return <div className="py-1.5 text-[13px] text-muted-foreground">{displayValue(field, stored, hints)}</div>
  if (field.type === 'boolean') return <Switch checked={Boolean(value)} onChange={onChange} label={field.name} />
  if (field.type === 'relation') {
    const label = relationLabel ?? String(stored ?? '—')
    return <div className="py-1.5 text-[13px]">{relationTo ? <AppLink to={relationTo} className="font-medium text-primary-text hover:underline">{label}</AppLink> : label}</div>
  }
  const multiline = Boolean(hints?.multiline) && field.type === 'text'
  if (!isEditable(field) || locked) {
    return <div className={cn('py-1.5 text-[13px] tabular-nums', field.type === 'decimal' || field.type === 'integer' ? 'font-medium' : 'text-muted-foreground', multiline && 'whitespace-pre-line break-words')}>{displayValue(field, stored, hints)}</div>
  }
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
  if (multiline) return <Textarea invalid={invalid} placeholder={placeholder} value={String(value)} onChange={(event) => onChange(event.target.value)} />
  return (
    <Input
      invalid={invalid}
      leading={hints?.prefix ? <span className="text-[13px]">{hints.prefix}</span> : undefined}
      trailing={hints?.suffix ? <span className="text-[13px]">{hints.suffix.trim()}</span> : undefined}
      placeholder={placeholder}
      className={cn(numeric.has(field.type) && 'text-right tabular-nums')}
      value={String(value)}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

/**
 * A field on a form: its field type's editor when the view chooses one that has an editor and the field may change,
 * its display when it may not, and the built-in input or value otherwise, and when the field type throws.
 */
export const FieldEditor = (props: FieldEditorProps) => {
  const { field, hints, value, stored, invalid, locked, onChange } = props
  const shown = useShownWidget(field, hints)
  const builtIn = <BuiltInEditor {...props} />
  if (!shown) return builtIn
  if (locked || !isEditable(field)) return <WidgetPart shown={shown} part="display" field={field} value={stored} fallback={builtIn} />
  // A file is uploaded and a relation chosen as the app does it; their field types only show them.
  if (field.type === 'file' || field.type === 'relation') return builtIn
  return <WidgetPart shown={shown} part="editor" field={field} value={fromDraft(field, value)} invalid={Boolean(invalid)} onChange={(next) => onChange(toFieldDraft(field, next))} fallback={builtIn} />
}
