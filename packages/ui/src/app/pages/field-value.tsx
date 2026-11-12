import type { FieldFormat, FieldModel, FieldViewModel, ResourceModel } from '@protobase/schema'
import { displayValue, valueTitle } from '../../live/display-value'
import { FileImage } from '../../live/file-image'
import { fileShown, shownImage } from '../../live/file-values'
import { useRelationTitle } from '../titles/use-relation-title'
import { cn } from '../../lib/cn'
import { useAdminMeta } from '../meta-gate'
import { AppLink } from '../use-app-address'
import { useShownWidget } from '../field-types/shown-widget'
import { WidgetPart } from '../field-types/widget-part'
import { ValueBadge } from '../value-badge'
import { Markdown } from '../../markdown/markdown'
import { isMarkdown } from '../../markdown/markdown-hint'
import { ContactLink } from '../../live/contact-link'
import { contactFormat } from '../../live/contact-links'
import { linkTextOf, type RelationLabels } from '../../live/link-text'
import { JsonBlock } from '../field-types/json/json-block'
import { text as appText } from '../messages'
import { FileLink } from '../file-viewers/file-link'

// A relation's target named as the record page names it, read unless the page already knows the name
const RelationLink = ({ target, id, known }: { target: ResourceModel; id: string; known?: string }) => {
  const title = useRelationTitle(target, id, known === undefined)
  return (
    <AppLink to={{ kind: 'record', resource: target.name, key: id }} className="font-medium text-primary-text hover:underline">
      {known ?? title ?? id}
    </AppLink>
  )
}

const RelationValue = ({ field, value, known }: { field: FieldModel; value: unknown; known?: string }) => {
  const { resources } = useAdminMeta()
  const target = field.relation ? resources[field.relation.resource] : undefined
  if (!target) return <span>{String(value)}</span>
  return <RelationLink target={target} id={String(value)} known={known} />
}

type FieldValueProps = {
  model: ResourceModel
  field: FieldModel
  value: unknown
  format?: FieldFormat
  relationLabel?: string
  /** The record the value is of, whose fields a url's link text takes. */
  record?: Record<string, unknown>
  /** The names of the records the record's relations point at, which a url's link text takes where resolved. */
  relationLabels?: RelationLabels
}

// A dash, which a screen reader reads as words
const EmptyValue = () => (
  <span className="text-muted-foreground">
    <span aria-hidden="true">—</span>
    <span className="sr-only">{appText('noValue')}</span>
  </span>
)

type ShownValueProps = {
  field: FieldModel
  value: unknown
  hints: FieldViewModel
  relationLabel?: string
  linkText?: string
  /** The resource and record the value is of, which a file opens in its media type's viewer on. */
  model?: ResourceModel
  record?: Record<string, unknown>
}

/**
 * A stored value as the view's `hints` show it, with no field type's display: a dash when empty, names for relations,
 * badges in the view's `valueColors` for enums and the `badge` format, timestamps as the `relative` format says, JSON
 * written out whole, an address as a link showing `linkText` when given and a file as a link to its download, or to its
 * viewer (`fileViewers`) when given its `model` and `record`.
 */
export const ShownValue = ({ field, value, hints, relationLabel, linkText, model, record }: ShownValueProps) => {
  if (value === null || value === undefined || value === '') return <EmptyValue />
  if (field.type === 'relation') return <RelationValue field={field} value={value} known={relationLabel} />
  const file = field.type === 'file' ? fileShown(value) : undefined
  if (file && 'url' in file && file.url) {
    const image = shownImage(value, { width: 40, height: 40 })
    return (
      <span className="inline-flex min-w-0 items-center gap-2">
        {image && <FileImage image={image} className="size-10 shrink-0 rounded border border-border object-cover" />}
        <FileLink field={field.name} model={model} record={record} name={file.name} url={file.url} className="truncate font-medium text-primary-text hover:underline" />
      </span>
    )
  }
  if (isMarkdown(field, hints)) return <Markdown source={String(value)} />
  if (field.type === 'json') return <JsonBlock value={value} />
  const text = displayValue(field, value, hints)
  const contact = field.type === 'text' ? contactFormat(hints) : undefined
  if (contact) return <ContactLink format={contact} value={text} label={linkText} />
  if (field.type === 'enum' || hints.format === 'badge') return <ValueBadge value={value} hints={hints}>{text}</ValueBadge>
  if (field.type === 'timestamp' || field.type === 'date') return <time dateTime={String(value)} title={valueTitle(field, value, undefined, hints)}>{text}</time>
  return <span title={valueTitle(field, value, undefined, hints)} className={cn(hints.format === 'code' && 'font-mono text-xs', (field.type === 'decimal' || field.type === 'integer') && 'tabular-nums', hints.multiline && 'whitespace-pre-line break-words')}>{text}</span>
}

const BuiltInValue = ({ model, field, value, format, relationLabel, record, relationLabels }: FieldValueProps) => {
  const { views } = useAdminMeta()
  const hints = { ...views[model.name]?.fields[field.name], ...(format && { format }) }
  const linkText = record && hints.format === 'url' ? linkTextOf(model, views[model.name], field.name, record, relationLabels) : undefined
  return <ShownValue field={field} value={value} hints={hints} relationLabel={relationLabel} linkText={linkText} model={model} record={record} />
}

/**
 * A stored value as the record page shows it: the display of the field type the view chooses, else the view's hints,
 * badges for statuses, names for relations (`relationLabel` when already known).
 */
export const FieldValue = (props: FieldValueProps) => {
  const { views } = useAdminMeta()
  const shown = useShownWidget(props.field, views[props.model.name]?.fields[props.field.name])
  const builtIn = <BuiltInValue {...props} />
  return shown ? <WidgetPart shown={shown} part="display" field={props.field} value={props.value} fallback={builtIn} /> : builtIn
}
