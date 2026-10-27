import { ArrowUpRight } from 'lucide-react'
import { Switch } from '../primitives/switch'
import { buttonClass } from '../primitives/button'
import { Input } from '../primitives/input'
import { Textarea } from '../primitives/textarea'
import { useFieldControl } from '../primitives/field-control'
import { cn } from '../lib/cn'
import { AppLink } from './use-app-address'
import { enumLabel, type AppAddress, type FieldModel, type FieldViewModel, type ResourceModel, type ViewModel } from '@protobase/schema'
import { RelationPicker } from './relation-picker'
import { SensitiveField } from './sensitive-field'
import { FileField } from './file-field'
import { displayValue, valueTitle } from '../live/display-value'
import { fromDraft, isEditable, toFieldDraft } from '../live/field-values'
import { useShownWidget } from './field-types/shown-widget'
import { WidgetPart } from './field-types/widget-part'
import { humanize } from '../live/naming'
import { Markdown } from '../markdown/markdown'
import { MarkdownEditor } from '../markdown/markdown-editor'
import { isMarkdown } from '../markdown/markdown-hint'
import { numeric, numericInputProps } from './numeric-input'
import { ContactLink } from '../live/contact-link'
import { contactFormat, contactInputProps } from '../live/contact-links'
import { text as appText } from './messages'
import { useChangeConfirm } from './change-confirm/use-change-confirm'

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
  /** A relation the user may change is chosen with a picker, and stays a link beside it to the record chosen. */
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

const BuiltInEditor = ({ field, hints, value, stored, relationLabel, relationTo, relationPicker, invalid, locked, placeholder, reveal, resource, onChange }: FieldEditorProps) => {
  const control = useFieldControl()
  if (field.type === 'file') return <FileField field={field} hints={hints} resource={resource ?? ''} value={value} locked={locked || !resource} invalid={invalid} onChange={onChange} />
  if (field.sensitive) return <SensitiveField field={field} hints={hints} value={value} reveal={reveal} locked={locked || field.readOnly} invalid={invalid} placeholder={placeholder} onChange={onChange} />
  if (field.type === 'relation' && relationPicker && !field.readOnly && !locked) {
    const picker = <RelationPicker target={relationPicker.target} view={relationPicker.view} value={String(value)} label={relationLabel} invalid={invalid} onChange={(next, label) => onChange({ key: next, label })} />
    if (!relationTo) return picker
    return (
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">{picker}</div>
        <AppLink to={relationTo} aria-label={appText('openLabel', relationLabel ?? String(value))} title={appText('open')} className={cn(buttonClass({ variant: 'ghost' }), 'w-8 px-0')}>
          <ArrowUpRight className="size-4" />
        </AppLink>
      </div>
    )
  }
  if (field.type === 'boolean' && locked) return <div className="py-1.5 text-muted-foreground">{displayValue(field, stored, hints)}</div>
  if (field.type === 'boolean') return <Switch checked={Boolean(value)} onChange={onChange} label={hints?.label ?? humanize(field.name)} />
  if (field.type === 'relation') {
    const label = relationLabel ?? String(stored ?? '—')
    return <div className="py-1.5">{relationTo ? <AppLink to={relationTo} className="font-medium text-primary-text hover:underline">{label}</AppLink> : label}</div>
  }
  const multiline = Boolean(hints?.multiline) && field.type === 'text'
  const markdown = isMarkdown(field, hints)
  if ((!isEditable(field) || locked) && markdown && typeof stored === 'string' && stored !== '') return <Markdown source={stored} className="py-1.5" />
  const contact = field.type === 'text' ? contactFormat(hints) : undefined
  if ((!isEditable(field) || locked) && contact && typeof stored === 'string' && stored !== '') return <div className="min-w-0 break-words py-1.5"><ContactLink format={contact} value={stored} /></div>
  if (!isEditable(field) || locked) {
    return <div title={valueTitle(field, stored, undefined, hints)} className={cn('py-1.5 tabular-nums', field.type === 'decimal' || field.type === 'integer' ? 'font-medium' : 'text-muted-foreground', multiline && 'whitespace-pre-line break-words')}>{displayValue(field, stored, hints)}</div>
  }
  if (field.type === 'enum') {
    return (
      <select
        {...control}
        {...(invalid && { 'aria-invalid': true })}
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full rounded-md border border-border-strong bg-background px-2 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        {value === '' && <option value="">{appText('choose')}</option>}
        {(field.enumValues ?? []).map((option) => (
          <option key={option} value={option}>
            {enumLabel(option, hints?.valueLabels)}
          </option>
        ))}
      </select>
    )
  }
  if (markdown) return <MarkdownEditor label={hints?.label ?? humanize(field.name)} invalid={invalid} placeholder={placeholder} value={String(value)} onChange={onChange} />
  if (multiline) return <Textarea invalid={invalid} placeholder={placeholder} value={String(value)} onChange={(event) => onChange(event.target.value)} />
  return (
    <Input
      invalid={invalid}
      leading={hints?.prefix ? <span>{hints.prefix}</span> : undefined}
      trailing={hints?.suffix ? <span>{hints.suffix.trim()}</span> : undefined}
      placeholder={placeholder}
      className={cn(numeric.has(field.type) && 'text-right tabular-nums')}
      {...numericInputProps(field.type)}
      {...contactInputProps(contact)}
      value={String(value)}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

const ChosenEditor = (props: FieldEditorProps) => {
  const { field, hints, value, stored, invalid, locked, onChange } = props
  const shown = useShownWidget(field, hints)
  const builtIn = <BuiltInEditor {...props} />
  if (!shown) return builtIn
  if (locked || !isEditable(field)) return <WidgetPart shown={shown} part="display" field={field} value={stored} fallback={builtIn} />
  // A file is uploaded and a relation chosen as the app does it; their field types only show them.
  if (field.type === 'file' || field.type === 'relation') return builtIn
  return <WidgetPart shown={shown} part="editor" field={field} value={fromDraft(field, value)} invalid={Boolean(invalid)} onChange={(next) => onChange(toFieldDraft(field, next))} fallback={builtIn} />
}

/**
 * A field on a form: its field type's editor when the view chooses one that has an editor and the field may change,
 * its display when it may not, and the built-in input or value otherwise, and when the field type throws. A field with
 * `.confirm()` asks its question before its value first changes.
 */
export const FieldEditor = (props: FieldEditorProps) => {
  const confirm = useChangeConfirm(props)
  return (
    <>
      <ChosenEditor {...props} onChange={confirm.onChange} />
      {confirm.dialog}
    </>
  )
}
