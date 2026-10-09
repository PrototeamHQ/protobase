import type { StatProps } from '@protobase/layout'
import type { ResourceModel } from '@protobase/schema'
import { Skeleton } from '../../../primitives/skeleton'
import { useAdminMeta } from '../../meta-gate'
import { Link } from '../../router'
import { FieldValue } from '../field-value'
import { useLayoutRecord } from '../record-scope'
import { useCount } from '../use-layout-data'
import { usePathValue } from '../use-path-value'
import { propsOf, type BlockProps } from './block-props'
import { CardFrame } from './card-frame'

const big = 'text-2xl font-semibold tracking-tight tabular-nums'

const Count = ({ model, filter }: { model: ResourceModel; filter?: string }) => {
  const count = useCount(model, filter)
  if (count.isPending) return <Skeleton className="h-8 w-16" />
  if (count.error) return <span className="text-[13px] text-danger-text">Could not count</span>
  const href = `/${model.name}${filter ? `?filter=${encodeURIComponent(filter)}` : ''}`
  return (
    <Link to={href} className={`${big} hover:text-primary-text`}>
      {count.data.toLocaleString('en-IE')}
    </Link>
  )
}

const RecordValue = ({ field, format }: { field: string; format: StatProps['format'] }) => {
  const value = usePathValue(useLayoutRecord(), field)
  if (value.state === 'loading') return <Skeleton className="h-8 w-16" />
  if (value.state === 'missing') return null
  return (
    <span className={big}>
      <FieldValue model={value.model} field={value.field} value={value.value} format={format} />
    </span>
  )
}

/** One number or value with a label: fixed, a count of matching records (linking to them), or a field of the record. */
export const StatBlock = ({ node }: BlockProps) => {
  const { label, value, resource, filter, field, format, description } = propsOf<StatProps>(node)
  const { resources } = useAdminMeta()
  const model = resource === undefined ? undefined : resources[resource]
  return (
    <CardFrame className="h-full">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <div className="mt-1">
        {value !== undefined && <span className={big}>{value}</span>}
        {model && <Count model={model} filter={filter} />}
        {field !== undefined && <RecordValue field={field} format={format} />}
      </div>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
    </CardFrame>
  )
}
