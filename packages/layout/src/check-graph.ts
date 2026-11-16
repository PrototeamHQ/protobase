import type { ResourceModel } from '@protobase/schema'
import { edgeCondition, edgeConditions } from './graph-edges'
import { isLayoutNode, type LayoutNode } from './node'
import { readsOf } from './plan-block'
import { sampledFilterErrors } from './sampled-filter'
import { label, walkTree } from './walk'

// A graph draws the records of `nodes` as boxes, each by its key, and the records of `edges` as lines between them,
// from the node an edge's `source` holds the key of to the one its `target` holds.

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

const numeric = ['integer', 'bigint', 'decimal']
const unshown = ['json', 'file']

const fieldProblems = (model: ResourceModel, prop: string, name: string): string[] => {
  const field = Object.hasOwn(model.fields, name) ? model.fields[name] : undefined
  if (!field) return [`${prop}: unknown field "${name}" on ${model.name}`]
  if (field.sensitive) return [`${prop}: "${name}" is sensitive, so a graph cannot show its values`]
  if ((prop === 'status' || prop === 'edgeStatus') && field.type !== 'enum') return [`${prop}: "${name}" is ${field.type}; a graph takes its colours from an enum field`]
  if ((prop === 'x' || prop === 'y') && !numeric.includes(field.type)) return [`${prop}: "${name}" is ${field.type}; a node's position is a number field`]
  return unshown.includes(field.type) ? [`${prop}: "${name}" is a ${field.type} field, which a graph cannot show`] : []
}

const named = (node: LayoutNode, model: ResourceModel, props: readonly string[]) => props.flatMap((prop) => (text(node.props[prop]) === undefined ? [] : fieldProblems(model, prop, String(node.props[prop]))))

const filterProblems = (model: ResourceModel, prop: string, filter: unknown) => {
  if (typeof filter !== 'string') return []
  const errors = sampledFilterErrors(model, filter)
  return errors.length === 0 ? [] : [`${prop}: ${errors.join('; ')}`]
}

// What draws once per node draws from the node's record alone: a block that reads records would read once per node
const nodeContentProblems = (node: LayoutNode): string[] => {
  const content = node.props.node
  const problems: string[] = []
  for (const element of isLayoutNode(content) ? [content] : Array.isArray(content) ? content.filter(isLayoutNode) : []) {
    walkTree(element, (inner, { path }) => {
      if (readsOf(inner).length > 0) problems.push(`node: ${path} reads records, which a node cannot: it draws once per node, from the node's own record; show related records with the children of "select"`)
    }, { path: label(element), scope: { stack: [] } })
  }
  return problems
}

/** What a graph names that its resources do not have or cannot draw, and how it is laid out. */
export const graphProblems = (node: LayoutNode, models: Record<string, ResourceModel>): string[] => {
  const nodes = text(node.props.nodes)
  const edges = text(node.props.edges)
  const nodeModel = nodes === undefined ? undefined : models[nodes]
  const edgeModel = edges === undefined ? undefined : models[edges]
  const problems = [
    ...(nodeModel ? [] : [`"nodes" names no resource: ${JSON.stringify(node.props.nodes)}`]),
    ...(edgeModel ? [] : [`"edges" names no resource: ${JSON.stringify(node.props.edges)}`]),
  ]
  if (nodeModel) {
    // An edge's `source` and `target` each hold one value, so a node is found by a key of one field
    if (nodeModel.primaryKey.length !== 1) problems.push(`nodes: ${nodeModel.name} has a key of ${nodeModel.primaryKey.length} fields, and an edge's source and target hold one value each; give the graph a resource with a key of one field`)
    problems.push(...named(node, nodeModel, ['label', 'group', 'status', 'x', 'y']), ...filterProblems(nodeModel, 'filter', node.props.filter))
    if ((node.props.x === undefined) !== (node.props.y === undefined)) problems.push('"x" and "y" place a node together; give both, or neither')
  }
  if (edgeModel) {
    problems.push(...named(node, edgeModel, ['source', 'target', 'edgeLabel', 'edgeStatus']), ...filterProblems(edgeModel, 'edgeFilter', node.props.edgeFilter))
    for (const name of edgeConditions) {
      const when = text(node.props[name])
      if (when === undefined) continue
      const parsed = edgeCondition(when)
      if (!parsed.ok) problems.push(`"${name}" is not a valid condition: ${parsed.message}`)
      else for (const path of parsed.paths) if (!Object.hasOwn(edgeModel.fields, path.split('.')[0]!)) problems.push(`${name}: "${path}" is no field of ${edgeModel.name}; a condition on an edge compares the edge's fields`)
    }
  }
  if (node.props.direction !== undefined && node.props.layout === 'force') problems.push('"direction" is for a layered graph; a force layout has none')
  return [...problems, ...nodeContentProblems(node)]
}
