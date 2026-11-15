import type { ResourceModel } from '@protobase/schema'
import { maxPerPage } from './list-blocks'
import type { LayoutNode } from './node'

// A timeline draws a lane per value of `lane`, a bar per value of `bar` in it, and a segment per record from `start`
// to `end`, coloured by the enum `color`.

const datedTypes = ['date', 'timestamp']
const unshown = ['json', 'file']

/** The fields a timeline reads of each record, in the order its text form's table shows them. */
export const timelineFields = (node: LayoutNode) => ['lane', 'bar', 'color', 'start', 'end'].map((prop) => String(node.props[prop]))

/** The order a timeline reads its records in: each bar's segments from its earliest start. */
export const timelineSort = (node: LayoutNode) => `${String(node.props.start)} asc`

const fieldOf = (model: ResourceModel, name: string) => (Object.hasOwn(model.fields, name) ? model.fields[name] : undefined)

const fieldProblems = (model: ResourceModel, prop: string, name: string): string[] => {
  const field = fieldOf(model, name)
  if (!field) return [`${prop}: unknown field "${name}" on ${model.name}`]
  if (field.sensitive) return [`${prop}: "${name}" is sensitive, so a timeline cannot show its values`]
  if (prop === 'start' || prop === 'end') return datedTypes.includes(field.type) ? [] : [`${prop}: "${name}" is ${field.type}; a segment runs between date or timestamp fields`]
  if (prop === 'color') return field.type === 'enum' ? [] : [`color: "${name}" is ${field.type}; a segment takes its colour from an enum field`]
  return unshown.includes(field.type) ? [`${prop}: "${name}" is a ${field.type} field, which has no values to group by`] : []
}

/** What a timeline names that its resource does not have or cannot draw, and a limit it cannot read at once. */
export const timelineProblems = (node: LayoutNode, model: ResourceModel): string[] => {
  const fields = ['lane', 'bar', 'start', 'end', 'color'].flatMap((prop) => fieldProblems(model, prop, String(node.props[prop])))
  const limit = node.props.limit
  const limits = limit === undefined || (typeof limit === 'number' && limit <= maxPerPage) ? [] : [`limit must be a whole number from 1 to ${maxPerPage}`]
  return [...fields, ...limits]
}
