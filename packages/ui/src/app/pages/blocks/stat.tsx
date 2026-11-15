import type { StatProps } from '@protobase/layout'
import type { ResourceModel } from '@protobase/schema'
import { Skeleton } from '../../../primitives/skeleton'
import { useAdminMeta } from '../../meta-gate'
import { filteredListAddress } from '../../list-link'
import { AppLink } from '../../use-app-address'
import { FieldValue } from '../field-value'
import { usePlanned, type Planned } from '../plan-reads'
import { useCount } from '../use-layout-data'
import { useScopedPathValue } from '../use-path-value'
import { cn } from '../../../lib/cn'
import { plainText } from './plain-value'
import { propsOf, type BlockProps } from './block-props'
import { CardFrame } from './card-frame'
import { formatTag } from '../../../locale/active-locale'
import { text } from '../messages'

const big = 'text-2xl font-semibold tracking-tight tabular-nums'

// A planned count is the total of its read, or inside a repeated record the count of that record's group
const plannedCount = (planned: Planned) => planned.total ?? Number(planned.rows[0]?.count ?? 0)

const Count = ({ model, at, filter }: { model: ResourceModel; at?: string; filter?: string }) => {
  const { views } = useAdminMeta()
  const planned = usePlanned(at)
  const own = useCount(model, filter, !planned)
  const count = planned ?? own
  if (count.isPending) return <Skeleton className="h-8 w-16" />
  if (count.error) return <span className="text-danger-text">{text('couldNotCount')}</span>
  const total = planned ? plannedCount(planned) : own.data!
  return (
    <AppLink to={filteredListAddress(views[model.name], model.name, filter)} className={`${big} hover:text-primary-text after:absolute after:inset-0 after:content-['']`}>
      {total.toLocaleString(formatTag())}
    </AppLink>
  )
}

const RecordValue = ({ field, format }: { field: string; format: StatProps['format'] }) => {
  const value = useScopedPathValue(field)
  if (value.state === 'loading') return <Skeleton className="h-8 w-16" />
  if (value.state === 'missing') return null
  if (value.state === 'plain') return <span className={big}>{plainText(value.value)}</span>
  return (
    <span className={big}>
      <FieldValue model={value.model} field={value.field} value={value.value} format={format} />
    </span>
  )
}

/**
 * One number or value with a label: fixed, a count of matching records (linking to them from anywhere on the card), or
 * a field of the record. A label that wraps pushes nothing out of line: the value sits at the card's bottom.
 */
export const StatBlock = ({ node, at, className }: BlockProps) => {
  const { label, value, resource, filter, field, format, description } = propsOf<StatProps>(node)
  const { resources } = useAdminMeta()
  const model = resource === undefined ? undefined : resources[resource]
  return (
    <CardFrame className={cn('relative h-full', className)} bodyClassName="flex flex-col">
      <p className="text-muted-foreground break-words">{label}</p>
      <div className="mt-auto pt-1">
        {value !== undefined && <span className={big}>{value}</span>}
        {model && <Count model={model} {...(at !== undefined && { at })} filter={filter} />}
        {field !== undefined && <RecordValue field={field} format={format} />}
      </div>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
    </CardFrame>
  )
}
