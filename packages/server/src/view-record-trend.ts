import type { RecordTrendModel, ResourceModel } from '@protobase/schema'
import { matchErrors } from './view-related'

const ranges = ['7d', '30d', '90d', '1y', 'all']
const granularities = ['hour', 'day', 'week', 'month']

// The trend counts the records per bucket of their date through the aggregate API, which filters on it
const atErrors = (model: ResourceModel, name: string) => {
  const field = Object.hasOwn(model.fields, name) ? model.fields[name]! : undefined
  if (!field) return [`at: unknown field "${name}" on ${model.name}`]
  if (field.type !== 'date' && field.type !== 'timestamp') return [`at: "${name}" on ${model.name} is ${field.type}, not a date or timestamp`]
  return field.filterable ? [] : [`at: "${name}" on ${model.name} is not filterable`]
}

/**
 * What is wrong with a trend of related records on the record page of `resource`, against these models; empty when it
 * can be shown. Against the full models it checks the config; against a caller's models, whether that caller can use it.
 */
export const recordTrendErrors = (item: RecordTrendModel, resource: string, models: Record<string, ResourceModel>): string[] => {
  const owner = models[resource]
  const target = models[item.resource]
  if (!owner || !target) return [`unknown resource "${owner ? item.resource : resource}"`]
  if (owner.primaryKey.length !== 1) return [`${resource} has a composite key, so a trend cannot match its records`]
  return [
    ...matchErrors(target, item.field, resource),
    ...atErrors(target, item.at),
    ...(ranges.includes(item.range) ? [] : [`range must be one of ${ranges.join(', ')}, not "${String(item.range)}"`]),
    ...(granularities.includes(item.granularity) ? [] : [`granularity must be one of ${granularities.join(', ')}, not "${String(item.granularity)}"`]),
  ]
}
