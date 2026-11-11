import { Skeleton } from '../../primitives/skeleton'
import { useAdminMeta } from '../meta-gate'
import { fieldLabel } from '../pages/blocks/field'
import { FieldValue } from '../pages/field-value'
import type { LayoutRecord } from '../pages/record-scope'
import { usePathValue } from '../pages/use-path-value'
import { Clamped } from './clamped'

const isEmpty = (value: unknown) => value === null || value === undefined || value === ''

/**
 * A field of a related record, through relations too, under its label unless `labelled` is false; `clamped` shows a
 * long value's first lines. A field without a value is left off, so only what the record says shows.
 */
export const RelatedField = ({ scope, path, labelled = true, clamped = false }: { scope: LayoutRecord; path: string; labelled?: boolean; clamped?: boolean }) => {
  const { views } = useAdminMeta()
  const value = usePathValue(scope, path)
  if (value.state === 'missing') return null
  if (value.state === 'ready' && isEmpty(value.value)) return null
  const shown = value.state === 'loading' ? <Skeleton className="h-4 w-24" /> : <FieldValue model={value.model} field={value.field} value={value.value} />
  const body = clamped ? <Clamped>{shown}</Clamped> : shown
  if (!labelled) return <div className="min-w-0">{body}</div>
  const label = fieldLabel(path, value.state === 'ready' ? views[value.model.name]?.fields[value.field.name]?.label : undefined)
  return (
    <div className="min-w-0">
      <dt className="text-body text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{body}</dd>
    </div>
  )
}
