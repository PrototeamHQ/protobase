import { threadSort, walkTree, type LayoutNode, type PageModel, type ToolCallSource } from '@protobase/layout'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import type { ReadShape } from './read-shape'
import { configFilter, configSort, sortText } from './shape-filters'
import { listSort } from './view-shapes'

// The blocks that list records of their `resource`; a RecordCard with a `recordKey` reads that one record by its key.
const listing = ['RecordRow', 'RecordCards', 'Table', 'CardRow', 'RecordCard', 'Stat', 'Thread']

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

// A RecordRow or RecordCards without a sort shows the records in the list's order, a Thread the newest messages
// first; the other blocks leave the order to the API.
const blockSort = (node: LayoutNode, model: ResourceModel, view: ViewModel | undefined) => {
  if (node.type === 'Thread') return configSort(model, threadSort(String(node.props.time)))
  const given = configSort(model, text(node.props.sort))
  if (given) return given
  return node.type === 'RecordRow' || node.type === 'RecordCards' ? listSort(model, view) : undefined
}

const title = (node: LayoutNode) => text(node.props.title) ?? text(node.props.label)

// A chart groups the records its filter finds by its `groupBy` field, and splits them by its `splitBy` field: the scan
// guard judges each grouped column, so each is a read of its own.
const chartShapes = (page: PageModel, node: LayoutNode, model: ResourceModel): ReadShape[] => {
  const source = text(node.props.filter)
  const filter = configFilter(model, source)
  const groupBy = String(node.props.groupBy)
  const named = title(node)
  const splitBy = text(node.props.splitBy)
  const request = `GET /${model.name}:aggregate?group_by=${groupBy}${source?.trim() ? `&filter=${source}` : ''}`
  const from = `page "${page.name}", <Chart${named ? ` "${named}"` : ''}>`
  return [
    { resource: model.name, request, from, query: { ...(filter && { filter }), groupBy } },
    ...(splitBy === undefined ? [] : [{ resource: model.name, request: `${request}&split_by=${splitBy}`, from, query: { ...(filter && { filter }), groupBy: splitBy } }]),
  ]
}

// A thread's tool calls are the latest of their own resource matching their own filter, newest first
const callShapes = (page: PageModel, node: LayoutNode, models: Record<string, ResourceModel>): ReadShape[] => {
  const calls = node.props.calls as unknown as ToolCallSource
  const model = models[calls.resource]
  if (!model) return []
  const filter = configFilter(model, calls.filter)
  const sort = configSort(model, threadSort(calls.time))
  const params = [...(calls.filter?.trim() ? [`filter=${calls.filter}`] : []), ...(sort ? [`order_by=${sortText(sort)}`] : [])]
  const named = title(node)
  return [{ resource: model.name, request: `GET /${model.name}${params.length > 0 ? `?${params.join('&')}` : ''}`, from: `page "${page.name}", <Thread${named ? ` "${named}"` : ''}> calls`, query: { ...(filter && { filter }), ...(sort && { sort }) } }]
}

/** The reads of a composed page: each block that lists records, with its filter and sort, a thread's tool calls, and each chart's grouping. */
export const pageShapes = (page: PageModel, models: Record<string, ResourceModel>, views: ViewModel[]): ReadShape[] => {
  const shapes: ReadShape[] = []
  walkTree(page.tree, (node) => {
    const model = node.custom ? undefined : models[text(node.props.resource) ?? '']
    if (model && node.type === 'Chart') {
      shapes.push(...chartShapes(page, node, model))
      return
    }
    if (!model || !listing.includes(node.type) || (node.type === 'RecordCard' && node.props.recordKey !== undefined)) return
    const source = text(node.props.filter)
    const filter = configFilter(model, source)
    const sort = node.type === 'Stat' ? undefined : blockSort(node, model, views.find((view) => view.resource === model.name && !view.roles))
    const params = [...(source?.trim() ? [`filter=${source}`] : []), ...(sort ? [`order_by=${sortText(sort)}`] : [])]
    const named = title(node)
    shapes.push({
      resource: model.name,
      request: `GET /${model.name}${params.length > 0 ? `?${params.join('&')}` : ''}`,
      from: `page "${page.name}", <${node.type}${named ? ` "${named}"` : ''}>`,
      query: { ...(filter && { filter }), ...(sort && { sort }) },
    })
    if (node.type === 'Thread' && node.props.calls !== undefined) shapes.push(...callShapes(page, node, models))
  })
  return shapes
}
