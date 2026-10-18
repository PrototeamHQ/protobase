import type { ChartBucket, ChartType } from '@protobase/layout'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { useAggregate } from '../../data/use-aggregates'
import { labelFieldOf } from '../../live/model-helpers'
import { Skeleton } from '../../primitives/skeleton'
import { useAdminMeta } from '../meta-gate'
import { periodPoints, valueSlices, type ChartMeasure } from './chart-groups'
import { GroupBars } from './group-bars'
import { GroupDonut } from './group-donut'
import { PeriodChart } from './period-chart'
import { viewerZone } from '../../format/zone'

/** What a chart shows: the records of `model` matching `filter`, grouped by `groupBy` and added up. */
export type ChartRequest = {
  model: ResourceModel
  view: ViewModel | undefined
  groupBy: string
  type?: ChartType
  sum?: string
  average?: string
  filter?: string
  granularity?: ChartBucket
  range?: '7d' | '30d' | '90d' | '1y' | 'all'
  limit?: number
  empty?: string
}

const measureOf = (model: ResourceModel, view: ViewModel | undefined, sum?: string, average?: string): ChartMeasure => {
  const name = sum ?? average
  const field = name === undefined ? undefined : model.fields[name]
  if (!field || name === undefined) return { kind: 'count' }
  return { kind: sum !== undefined ? 'sum' : 'average', field, hints: view?.fields[name] }
}

/**
 * Loads a chart's groups through `:aggregate` and draws them: a date field's buckets as bars or a line, a field's
 * values as ranked bars or a donut, each value linking to its records. The server checked the chart at startup.
 */
export const ChartView = ({ model, view, groupBy, type = 'bar', sum, average, filter = '', granularity = 'day', range = '30d', limit = 10, empty = 'Nothing to chart yet.' }: ChartRequest) => {
  const { resources, views } = useAdminMeta()
  const field = model.fields[groupBy]
  const dated = field?.type === 'date' || field?.type === 'timestamp'
  const target = field?.type === 'relation' && field.relation ? resources[field.relation.resource] : undefined
  const label = target && target.primaryKey.length === 1 ? labelFieldOf(target, views[target.name]) : undefined
  // A timestamp's buckets are the viewer's days, hours and months; a date's are its own
  const params = dated ? { granularity, range, timeZone: viewerZone() } : { limit, ...(label && { label }) }
  const result = useAggregate(model.name, { groupBy, filter, ...(sum && { sum }), ...(average && { average }), ...params }, Boolean(field))
  const measure = measureOf(model, view, sum, average)
  if (!field) return null
  if (result.isPending) return <Skeleton className="h-36 w-full" />
  if (result.error) return <p className="text-danger-text">Could not load the chart.</p>
  const { groups } = result.data
  if (groups.every((group) => group.count === 0)) return <p className="text-muted-foreground">{empty}</p>
  if (dated) return <PeriodChart points={periodPoints(groups, measure)} measure={measure} bucket={granularity} type={type === 'line' ? 'line' : 'bar'} />
  const slices = valueSlices(groups, field, view?.fields[groupBy], measure, filter)
  return type === 'donut' ? <GroupDonut resource={model.name} slices={slices} measure={measure} /> : <GroupBars resource={model.name} slices={slices} measure={measure} />
}
