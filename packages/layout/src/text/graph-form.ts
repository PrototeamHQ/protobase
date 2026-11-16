import { graphShape, type GraphFields } from '../graph-shape'
import { planReadId } from '../read-plan'
import { blocks, escapeMarkdown, list, strong, valueText } from './markdown'
import type { TextFieldLabels, TextForm } from './text-form'

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

// A value as Markdown, as its field's value labels say it, or as it is stored
const valueOf = (labels: TextFieldLabels | undefined, value: unknown) => valueText(value, labels?.valueLabels)

/**
 * A `Graph`'s text form: each group with its nodes and their status, the nodes in no group, then each edge as
 * `a → b`, with its `edgeLabel` after it, from the records the page's plan read; its fallback without them.
 */
const Graph: TextForm = ({ node, at, children, fallback, options }) => {
  const nodes = text(node.props.nodes)
  const edges = text(node.props.edges)
  const model = nodes === undefined ? undefined : options.models?.[nodes]
  const edgeModel = edges === undefined ? undefined : options.models?.[edges]
  const fields: GraphFields = {
    label: String(node.props.label),
    source: String(node.props.source),
    target: String(node.props.target),
    ...(text(node.props.group) && { group: String(node.props.group) }),
    ...(text(node.props.status) && { status: String(node.props.status) }),
  }
  const nodeRows = options.planned?.(planReadId({ block: at, part: 'nodes' }), options.record)
  const edgeRows = options.planned?.(planReadId({ block: at, part: 'edges' }), options.record) ?? []
  // A node is found by a key of one field, as an edge's `source` and `target` each hold one value; without its records
  // it reads as what stands in for it
  if (!model || !edgeModel || !nodeRows || model.primaryKey.length !== 1) return blocks([...(fallback ?? []), ...children])
  const labels = options.labels?.[model.name] ?? {}
  const edgeLabels = options.labels?.[edgeModel.name] ?? {}
  const shape = graphShape({ nodes: nodeRows, edges: edgeRows, key: model.primaryKey[0]!, edgeKey: edgeModel.primaryKey, fields })
  if (shape.nodes.length === 0) return blocks([escapeMarkdown(text(node.props.empty) ?? ''), ...children])
  const named = new Map(shape.nodes.map((each) => [each.id, escapeMarkdown(String(each.row[fields.label] ?? each.id))]))
  const line = (row: Record<string, unknown>) => {
    const name = escapeMarkdown(String(row[fields.label] ?? ''))
    return fields.status === undefined || row[fields.status] == null ? name : `${name} (${valueOf(labels[fields.status], row[fields.status])})`
  }
  const groups = shape.groups.map((group) => {
    const members = shape.nodes.filter((each) => each.group === group.id).map((each) => line(each.row))
    return blocks([strong(valueOf(labels[fields.group!], group.value)), list(members)], '\n')
  })
  const loose = shape.nodes.filter((each) => each.group === undefined).map((each) => line(each.row))
  const edgeLabel = text(node.props.edgeLabel)
  const links = shape.edges.map((edge) => {
    const said = edgeLabel === undefined || edge.row[edgeLabel] == null ? '' : ` (${valueOf(edgeLabels[edgeLabel], edge.row[edgeLabel])})`
    return `${named.get(edge.source)} → ${named.get(edge.target)}${said}`
  })
  return blocks([...groups, ...(loose.length > 0 ? [list(loose)] : []), ...(links.length > 0 ? [list(links)] : []), ...children])
}

export const graphForms: Record<string, TextForm> = { Graph }
