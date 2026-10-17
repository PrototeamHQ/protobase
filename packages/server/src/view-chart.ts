import type { ChartModel, ResourceModel } from '@protobase/schema'
import { isGroupChart } from '@protobase/schema/internal'

const numericTypes = ['integer', 'bigint', 'decimal']
// A date is charted over time, and a file or JSON holds no value to group by
const ungroupable = ['date', 'timestamp', 'json', 'file']

/**
 * What is wrong with a list's chart per value of a field: a field to group by that has no values to share out, or one
 * to add up that is no number. The filterable and sensitive checks of every chart are with the other fields'.
 */
export const chartErrors = (chart: ChartModel, model: ResourceModel): string[] => {
  if (!isGroupChart(chart)) return []
  const fieldOf = (name: string) => (Object.hasOwn(model.fields, name) ? model.fields[name] : undefined)
  const group = fieldOf(chart.groupBy)
  const measured = chart.sum ?? chart.average
  const measure = measured === undefined ? undefined : fieldOf(measured)
  return [
    ...(!group ? [`groupBy: unknown field "${chart.groupBy}" on ${model.name}`] : []),
    ...(group && ungroupable.includes(group.type) ? [`groupBy: "${chart.groupBy}" is a ${group.type} field; chart a date with { field, range, granularity }, and group by a field of values`] : []),
    ...(measured !== undefined && !measure ? [`unknown field "${measured}" on ${model.name} to add up`] : []),
    ...(measure && !numericTypes.includes(measure.type) ? [`"${measured}" is ${measure.type}, and only a number can be added up`] : []),
    ...(chart.type === 'donut' && chart.average !== undefined ? ['a donut shares out a total, and averages add up to none: count or sum instead'] : []),
  ]
}
