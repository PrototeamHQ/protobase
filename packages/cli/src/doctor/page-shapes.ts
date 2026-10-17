import { walkTree, type LayoutNode, type PageModel } from '@protobase/layout'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import type { ReadShape } from './read-shape'
import { configFilter, configSort, sortText } from './shape-filters'
import { listSort } from './view-shapes'

// The blocks that list records of their `resource`; a RecordCard with a `recordKey` reads that one record by its key.
const listing = ['RecordRow', 'Table', 'CardRow', 'RecordCard', 'Stat']

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

// A RecordRow without a sort shows the records in the list's order; the other blocks leave the order to the API.
const blockSort = (node: LayoutNode, model: ResourceModel, view: ViewModel | undefined) => {
  const given = configSort(model, text(node.props.sort))
  if (given) return given
  return node.type === 'RecordRow' ? listSort(model, view) : undefined
}

const title = (node: LayoutNode) => text(node.props.title) ?? text(node.props.label)

// A chart groups the records its filter finds by its `groupBy` field.
const chartShape = (page: PageModel, node: LayoutNode, model: ResourceModel): ReadShape => {
  const source = text(node.props.filter)
  const filter = configFilter(model, source)
  const groupBy = String(node.props.groupBy)
  const named = title(node)
  return {
    resource: model.name,
    request: `GET /${model.name}:aggregate?group_by=${groupBy}${source?.trim() ? `&filter=${source}` : ''}`,
    from: `page "${page.name}", <Chart${named ? ` "${named}"` : ''}>`,
    query: { ...(filter && { filter }), groupBy },
  }
}

/** The reads of a composed page: each block that lists records, with its filter and sort, and each chart's grouping. */
export const pageShapes = (page: PageModel, models: Record<string, ResourceModel>, views: ViewModel[]): ReadShape[] => {
  const shapes: ReadShape[] = []
  walkTree(page.tree, (node) => {
    const model = node.custom ? undefined : models[text(node.props.resource) ?? '']
    if (model && node.type === 'Chart') {
      shapes.push(chartShape(page, node, model))
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
  })
  return shapes
}
