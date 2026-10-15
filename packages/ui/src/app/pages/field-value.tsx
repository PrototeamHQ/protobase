import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { FieldFormat, FieldModel, ResourceModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'
import { displayValue } from '../../live/display-value'
import { FileImage } from '../../live/file-image'
import { fileShown, shownImage } from '../../live/file-values'
import { fetchLabels } from '../../live/relation-labels'
import { cn } from '../../lib/cn'
import { useAdminMeta } from '../meta-gate'
import { AppLink } from '../use-app-address'
import { useShownWidget } from '../field-types/shown-widget'
import { WidgetPart } from '../field-types/widget-part'
import { ValueBadge } from '../value-badge'

const RelationValue = ({ field, value, known }: { field: FieldModel; value: unknown; known?: string }) => {
  const { resources, views } = useAdminMeta()
  const client = useClient()
  const queryClient = useQueryClient()
  const target = field.relation ? resources[field.relation.resource] : undefined
  const id = String(value)
  const label = useQuery({
    queryKey: keys.relatedLabel(target?.name ?? '', id),
    enabled: Boolean(target) && known === undefined,
    queryFn: async () => (await fetchLabels(queryClient, client, target!, [id], views[target!.name])).get(id) ?? id,
  })
  if (!target) return <span>{id}</span>
  return (
    <AppLink to={{ kind: 'record', resource: target.name, key: id }} className="font-medium text-primary-text hover:underline">
      {known ?? label.data ?? id}
    </AppLink>
  )
}

type FieldValueProps = { model: ResourceModel; field: FieldModel; value: unknown; format?: FieldFormat; relationLabel?: string }

const BuiltInValue = ({ model, field, value, format, relationLabel }: FieldValueProps) => {
  const { views } = useAdminMeta()
  const hints = { ...views[model.name]?.fields[field.name], ...(format && { format }) }
  if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">—</span>
  if (field.type === 'relation') return <RelationValue field={field} value={value} known={relationLabel} />
  const file = field.type === 'file' ? fileShown(value) : undefined
  if (file && 'url' in file && file.url) {
    const image = shownImage(value, { width: 40, height: 40 })
    return (
      <span className="inline-flex min-w-0 items-center gap-2">
        {image && <FileImage image={image} className="size-10 shrink-0 rounded border border-border object-cover" />}
        <a href={file.url} target="_blank" rel="noreferrer" className="truncate font-medium text-primary-text hover:underline">{file.name}</a>
      </span>
    )
  }
  const text = displayValue(field, value, hints)
  if (field.type === 'enum' || hints.format === 'badge') return <ValueBadge value={value} hints={hints}>{text}</ValueBadge>
  return <span className={cn(hints.format === 'code' && 'font-mono text-xs', (field.type === 'decimal' || field.type === 'integer') && 'tabular-nums', hints.multiline && 'whitespace-pre-line break-words')}>{text}</span>
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
