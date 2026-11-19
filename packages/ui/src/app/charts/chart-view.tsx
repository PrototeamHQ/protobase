import type { ChartBucket, ChartType } from '@protobase/layout'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { useAggregate } from '../../data/use-aggregates'
import { Skeleton } from '../../primitives/skeleton'
import { useAdminMeta } from '../meta-gate'
import { periodPoints, valueSlices, type ChartMeasure } from './chart-groups'
import { chartAggregate } from './chart-params'
import { GroupBars } from './group-bars'
import { GroupDonut, PeriodChart } from './lazy-charts'
import { splitPoints } from './split-points'
import { text } from './messages'

/** What a chart shows: the records of `model` matching `filter`, grouped by `groupBy` and added up. */
export type ChartRequest = {
  model: ResourceModel
  view: ViewModel | undefined
  groupBy: string
  /** With a dated `groupBy`: a field of values that splits each bucket. */
  splitBy?: string
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
export const ChartView = ({ model, view, groupBy, splitBy, type = 'bar', sum, average, filter = '', granularity = 'day', range = '30d', limit = 10, empty = text('nothingYet') }: ChartRequest) => {
  const { resources, views } = useAdminMeta()
  const field = model.fields[groupBy]
  const dated = field?.type === 'date' || field?.type === 'timestamp'
  const splitField = dated && splitBy !== undefined ? model.fields[splitBy] : undefined
  const params = chartAggregate({ model, groupBy, splitBy, sum, average, filter, granularity, range, limit }, resources, views)
  const result = useAggregate(model.name, params ?? { groupBy }, params !== undefined)
  const measure = measureOf(model, view, sum, average)
  if (!field) return null
  if (result.isPending) return <Skeleton className="h-36 w-full" />
  if (result.error) return <p className="text-danger-text">{text('couldNotLoad')}</p>
  const { groups } = result.data
  if (groups.every((group) => group.count === 0)) return <p className="text-muted-foreground">{empty}</p>
  const chartType = type === 'line' ? 'line' : 'bar'
  if (dated && splitField && result.data.splits) {
    const { series, points } = splitPoints(groups, result.data.splits, splitField, view?.fields[splitField.name], measure, filter)
    return <PeriodChart points={points} measure={measure} bucket={granularity} type={chartType} series={series} resource={model.name} view={view} />
  }
  if (dated) return <PeriodChart points={periodPoints(groups, measure)} measure={measure} bucket={granularity} type={chartType} />
  const slices = valueSlices(groups, field, view?.fields[groupBy], measure, filter)
  return type === 'donut' ? <GroupDonut resource={model.name} view={view} slices={slices} measure={measure} /> : <GroupBars resource={model.name} view={view} slices={slices} measure={measure} />
}
