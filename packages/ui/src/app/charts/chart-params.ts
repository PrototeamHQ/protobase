import type { AggregateParams } from '@protobase/client'
import type { ChartProps } from '@protobase/layout'
import type { FieldModel, ResourceModel, ViewModel } from '@protobase/schema'
import { viewerZone } from '../../format/zone'
import { labelFieldOf } from '../../live/model-helpers'
import { seriesColors } from './chart-groups'

// For a relation to a single-key resource: the field of that resource that names each of its records
const labelOf = (field: FieldModel | undefined, resources: Record<string, ResourceModel>, views: Record<string, ViewModel>) => {
  const target = field?.type === 'relation' && field.relation ? resources[field.relation.resource] : undefined
  return target && target.primaryKey.length === 1 ? labelFieldOf(target, views[target.name]) : undefined
}

type ChartAsked = { model: ResourceModel } & Pick<ChartProps, 'groupBy' | 'splitBy' | 'sum' | 'average' | 'filter' | 'granularity' | 'range' | 'limit'>

/**
 * The `:aggregate` a chart reads: a date field's buckets in the viewer's time zone, split by `splitBy`, or a field's
 * first `limit` values, named by the records a relation points at; `undefined` for a field the model lacks.
 */
export const chartAggregate = ({ model, groupBy, splitBy, sum, average, filter = '', granularity = 'day', range = '30d', limit = 10 }: ChartAsked, resources: Record<string, ResourceModel>, views: Record<string, ViewModel>): AggregateParams | undefined => {
  const field = model.fields[groupBy]
  if (!field) return
  const dated = field.type === 'date' || field.type === 'timestamp'
  const label = labelOf(field, resources, views)
  const splitField = dated && splitBy !== undefined ? model.fields[splitBy] : undefined
  const splitLabel = labelOf(splitField, resources, views)
  // A timestamp's buckets are the viewer's days, hours and months; a date's are its own
  const split = splitField ? { splitBy: splitField.name, splitLimit: seriesColors, ...(splitLabel && { splitLabel }) } : {}
  const params = dated ? { granularity, range, timeZone: viewerZone(), ...split } : { limit, ...(label && { label }) }
  return { groupBy, filter, ...(sum && { sum }), ...(average && { average }), ...params }
}
