import type { FieldProps } from '@protobase/layout'
import { humanize } from '../../../live/naming'
import { Skeleton } from '../../../primitives/skeleton'
import { useAdminMeta } from '../../meta-gate'
import { FieldValue } from '../field-value'
import { useLayoutRecord } from '../record-scope'
import { usePathValue } from '../use-path-value'
import { propsOf, type BlockProps } from './block-props'

/** The view's label for the field at the end of the path, else the path in words: `companyId.city` is "Company city". */
export const fieldLabel = (path: string, viewLabel: string | undefined) => {
  if (viewLabel) return viewLabel
  const words = path.split('.').map((part) => humanize(part).toLowerCase()).join(' ')
  return words[0]!.toUpperCase() + words.slice(1)
}

/** A label over a value of the record around it; `label={false}` shows the value alone. */
export const FieldBlock = ({ node }: BlockProps) => {
  const { name, label, format } = propsOf<FieldProps>(node)
  const { views } = useAdminMeta()
  const value = usePathValue(useLayoutRecord(), name)
  if (value.state === 'missing') return null
  const shown = value.state === 'loading' ? <Skeleton className="h-4 w-24" /> : <FieldValue model={value.model} field={value.field} value={value.value} format={format} />
  if (label === false) return <div className="text-[13px]">{shown}</div>
  const text = label ?? fieldLabel(name, value.state === 'ready' ? views[value.model.name]?.fields[value.field.name]?.label : undefined)
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{text}</div>
      <div className="mt-0.5 truncate text-[13px]">{shown}</div>
    </div>
  )
}
