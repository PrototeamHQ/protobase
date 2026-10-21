import type { RecordChartModel, ResourceModel } from '@protobase/schema'
import { matchErrors } from './view-related'

const numericTypes = ['integer', 'bigint', 'decimal']
const ranges = ['1h', '24h', '7d']

// The chart groups the records by their time, so it reads it through the aggregate API, which filters on it
const atErrors = (model: ResourceModel, name: string) => {
  const field = Object.hasOwn(model.fields, name) ? model.fields[name]! : undefined
  if (!field) return [`at: unknown field "${name}" on ${model.name}`]
  if (field.type !== 'timestamp') return [`at: "${name}" on ${model.name} is ${field.type}, not a timestamp`]
  return field.filterable ? [] : [`at: "${name}" on ${model.name} is not filterable`]
}

// A sensitive value never leaves the server, not even averaged
const seriesErrors = (model: ResourceModel, name: string) => {
  const field = Object.hasOwn(model.fields, name) ? model.fields[name]! : undefined
  if (!field) return [`series: unknown field "${name}" on ${model.name}`]
  if (!numericTypes.includes(field.type)) return [`series: "${name}" on ${model.name} is ${field.type}, not a number`]
  return field.sensitive ? [`series: "${name}" on ${model.name} is sensitive`] : []
}

/**
 * What is wrong with a chart of related records on the record page of `resource`, against these models; empty when it
 * can be shown. Against the full models it checks the config; against a caller's models, whether that caller can use it.
 */
export const recordChartErrors = (item: RecordChartModel, resource: string, models: Record<string, ResourceModel>): string[] => {
  const owner = models[resource]
  const target = models[item.resource]
  if (!owner || !target) return [`unknown resource "${owner ? item.resource : resource}"`]
  if (owner.primaryKey.length !== 1) return [`${resource} has a composite key, so a chart cannot match its records`]
  return [
    ...matchErrors(target, item.field, resource),
    ...atErrors(target, item.at),
    ...(item.series.length === 0 ? ['series: name at least one field'] : item.series.flatMap((name) => seriesErrors(target, name))),
    ...(item.range === undefined || ranges.includes(item.range) ? [] : [`range must be one of ${ranges.join(', ')}, not "${String(item.range)}"`]),
  ]
}
