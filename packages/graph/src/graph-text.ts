import { markdown, planReadId, type TextFieldLabels, type TextForm } from '@protobase/layout'
import { graphShape, type GraphFields } from './graph-shape'

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

// A value as Markdown, as its field's value labels say it, or as it is stored
const valueOf = (labels: TextFieldLabels | undefined, value: unknown) => markdown.valueText(value, labels?.valueLabels)

/**
 * A `Graph`'s text form, for clients that draw no blocks, MCP clients and LLMs: each group with its nodes and their
 * status, then each edge as `a → b`, from the records the page's plan read; its heading alone without them. Pass it to
 * `renderText` or `pageText` as `forms: { Graph: graphText }`.
 */
export const graphText: TextForm = ({ node, at, children, options }) => {
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
  if (!model || !edgeModel || !nodeRows) return markdown.blocks(children)
  const labels = options.labels?.[model.name] ?? {}
  const shape = graphShape({ nodes: nodeRows, edges: edgeRows, key: model.primaryKey[0]!, edgeKey: edgeModel.primaryKey[0]!, fields })
  if (shape.nodes.length === 0) return markdown.blocks([markdown.escapeMarkdown(text(node.props.empty) ?? ''), ...children])
  const named = new Map(shape.nodes.map((each) => [each.id, markdown.escapeMarkdown(String(each.row[fields.label] ?? each.id))]))
  const line = (row: Record<string, unknown>) => {
    const name = markdown.escapeMarkdown(String(row[fields.label] ?? ''))
    return fields.status === undefined || row[fields.status] == null ? name : `${name} (${valueOf(labels[fields.status], row[fields.status])})`
  }
  const groups = shape.groups.map((group) => {
    const members = shape.nodes.filter((each) => each.group === group.id).map((each) => line(each.row))
    return markdown.blocks([markdown.strong(valueOf(labels[fields.group!], group.value)), markdown.list(members)], '\n')
  })
  const loose = shape.nodes.filter((each) => each.group === undefined).map((each) => line(each.row))
  const links = shape.edges.map((edge) => `${named.get(edge.source)} → ${named.get(edge.target)}`)
  return markdown.blocks([...groups, ...(loose.length > 0 ? [markdown.list(loose)] : []), ...(links.length > 0 ? [markdown.list(links)] : []), ...children])
}
