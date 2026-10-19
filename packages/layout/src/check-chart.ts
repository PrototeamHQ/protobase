import type { FieldModel, ResourceModel } from '@protobase/schema'
import type { LayoutNode } from './node'

const numericTypes = ['integer', 'bigint', 'decimal']
const ungroupable = ['json', 'file']

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

/** Whether a chart's `groupBy` is a date or timestamp field, which it buckets, rather than a field of values. */
export const isDatedGroup = (field: FieldModel | undefined) => field?.type === 'date' || field?.type === 'timestamp'

/** The fields a chart reads: the one it groups by, the one it splits by, and the one it adds up when it has `sum` or `average`. */
export const chartFields = (node: LayoutNode) =>
  [text(node.props.groupBy), text(node.props.splitBy), text(node.props.sum) ?? text(node.props.average)].filter((name) => name !== undefined)

const fieldOf = (model: ResourceModel, name: string) => (Object.hasOwn(model.fields, name) ? model.fields[name] : undefined)

const groupProblems = (model: ResourceModel, name: string, prop = 'groupBy'): string[] => {
  const field = fieldOf(model, name)
  if (!field) return [`${prop}: unknown field "${name}" on ${model.name}`]
  if (field.sensitive) return [`${prop}: "${name}" is sensitive, so a chart cannot show its values`]
  if (ungroupable.includes(field.type)) return [`${prop}: "${name}" is a ${field.type} field, which has no values to group by`]
  return field.filterable ? [] : [`${prop}: "${name}" is not filterable, so the API refuses to group by it: mark "${name}" .filterable()`]
}

const splitProblems = (model: ResourceModel, name: string): string[] => {
  const problems = groupProblems(model, name, 'splitBy')
  if (problems.length > 0) return problems
  return isDatedGroup(fieldOf(model, name)) ? [`splitBy: "${name}" is a date field; split by a field of values`] : []
}

const measureProblems = (model: ResourceModel, prop: 'sum' | 'average', name: string): string[] => {
  const field = fieldOf(model, name)
  if (!field) return [`${prop}: unknown field "${name}" on ${model.name}`]
  if (field.sensitive) return [`${prop}: "${name}" is sensitive, so a chart cannot add it up`]
  return numericTypes.includes(field.type) ? [] : [`${prop}: "${name}" is ${field.type}, and only a number can be added up`]
}

// A line runs through time and a donut shares out values, so each fits only its kind of group, as do their options.
const shapeProblems = (node: LayoutNode, dated: boolean): string[] => {
  const type = text(node.props.type) ?? 'bar'
  const given = (names: string[]) => names.filter((name) => node.props[name] !== undefined)
  if (dated) {
    return [
      ...(type === 'donut' ? ['a donut shares out values, so it needs a groupBy of values, not dates'] : []),
      ...(type === 'bar' && node.props.splitBy !== undefined && node.props.average !== undefined
        ? ['a split bar stacks its parts, and averages add up to none: use a line, or count or sum']
        : []),
      ...given(['limit']).map((name) => `"${name}" is for a groupBy of values, not dates`),
    ]
  }
  return [
    ...(type === 'line' ? ['a line runs through time, so it needs a date or timestamp groupBy'] : []),
    ...(type === 'donut' && node.props.average !== undefined ? ['a donut shares out a total, and averages add up to none: count or sum instead'] : []),
    ...given(['granularity', 'range', 'splitBy']).map((name) => `"${name}" is for a date or timestamp groupBy`),
  ]
}

/** What a chart names that its resource does not allow: the field it groups by, the one it adds up, and its shape. */
export const chartProblems = (node: LayoutNode, model: ResourceModel): string[] => {
  const groupBy = String(node.props.groupBy)
  const sum = text(node.props.sum)
  const average = text(node.props.average)
  const splitBy = text(node.props.splitBy)
  const grouped = groupProblems(model, groupBy)
  return [
    ...grouped,
    ...(splitBy !== undefined ? splitProblems(model, splitBy) : []),
    ...(sum !== undefined ? measureProblems(model, 'sum', sum) : []),
    ...(average !== undefined ? measureProblems(model, 'average', average) : []),
    ...(grouped.length === 0 ? shapeProblems(node, isDatedGroup(fieldOf(model, groupBy))) : []),
  ]
}
