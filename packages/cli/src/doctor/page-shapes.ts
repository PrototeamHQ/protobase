import { compileReadPlan, elementAt, type PageModel, type PlanRead } from '@protobase/layout'
import { printFilter, type FilterExpr, type RelatedFilter, type ResourceModel, type ViewModel } from '@protobase/schema'
import { splitRelated } from '@protobase/schema/internal'
import type { ReadShape } from './read-shape'
import { all, anyOf, configFilter, configSort, sortText } from './shape-filters'
import { fitSlots, parseSampled } from './slot-samples'
import { listSort } from './view-shapes'

// A composed page's reads are its read plan's: each block's read, and for each `related()` term in it the read of the
// records it ties to, which the API makes beside it with that term's own filter and order.

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

/** A filter's terms ANDed at the top, `related()` ones apart: the rest as the index rule reads it, the related field as `in()`. */
const judged = (model: ResourceModel, ast: FilterExpr | undefined) => {
  if (!ast) return { terms: [] as RelatedFilter[] }
  const { terms, rest } = splitRelated(ast)
  const fields = terms.flatMap((term) => (model.fields[term.field.path[0]!] ? [anyOf(model.fields[term.field.path[0]!]!)] : []))
  return { terms, filter: all([rest && configFilter(model, printFilter(fitSlots(rest, model))), ...fields]) }
}

// The records a `related()` term reads, as a list of them, which selects its key, and the terms nested in it
const relatedShapes = (term: RelatedFilter, models: Record<string, ResourceModel>, from: string): ReadShape[] => {
  const model = models[term.resource]
  if (!model) return []
  const { terms, filter } = judged(model, term.filter)
  const sort = configSort(model, term.orderBy)
  const key = model.fields[term.key]
  // A JSON list of keys is read whole, with no index on it
  const selects = key && key.type !== 'json' ? key : undefined
  const params = [...(term.filter ? [`filter=${printFilter(term.filter)}`] : []), ...(sort ? [`order_by=${sortText(sort)}`] : [])]
  const shape: ReadShape = { resource: model.name, request: `GET /${model.name}${params.length > 0 ? `?${params.join('&')}` : ''}`, from: `${from} related ${term.resource}.${term.key}`, query: { ...(filter && { filter }), ...(sort && { sort }), ...(selects && { selects }) } }
  return [shape, ...terms.flatMap((nested) => relatedShapes(nested, models, from))]
}

const title = (page: PageModel, read: PlanRead) => {
  const node = elementAt(page.tree, read.block)
  const named = node && (text(node.props.title) ?? text(node.props.label))
  const part = read.part === 'calls' ? ' calls' : read.part === 'chosen' ? ' chosen row' : read.part === 'condition' ? ' condition' : ''
  return `page "${page.name}", <${node?.type ?? 'Page'}${named ? ` "${named}"` : ''}>${part}`
}

// A RecordRow or RecordCards without a sort shows the records in the list's order; the other blocks leave it to the API
const readSort = (page: PageModel, read: PlanRead, model: ResourceModel, view: ViewModel | undefined) => {
  if (read.orderBy !== undefined) return configSort(model, read.orderBy)
  const type = elementAt(page.tree, read.block)?.type
  return type === 'RecordRow' || type === 'RecordCards' ? listSort(model, view) : undefined
}

const readShapes = (page: PageModel, read: PlanRead, models: Record<string, ResourceModel>, views: ViewModel[]): ReadShape[] => {
  const model = models[read.resource]
  if (!model) return []
  const from = title(page, read)
  const { terms, filter } = judged(model, parseSampled(read.filter))
  const filterParam = read.filter?.trim() ? [`filter=${read.filter}`] : []
  const related = terms.flatMap((term) => relatedShapes(term, models, from))
  if (read.kind === 'aggregate') {
    const [groupBy, splitBy] = read.groupBy ?? []
    const request = `GET /${model.name}:aggregate?group_by=${groupBy}${filterParam.map((param) => `&${param}`).join('')}`
    // The scan guard judges each grouped column, so each is a read of its own
    return [
      { resource: model.name, request, from, query: { ...(filter && { filter }), ...(groupBy && { groupBy }) } },
      ...(splitBy === undefined ? [] : [{ resource: model.name, request: `${request}&split_by=${splitBy}`, from, query: { ...(filter && { filter }), groupBy: splitBy } }]),
      ...related,
    ]
  }
  const sort = read.kind === 'count' ? undefined : readSort(page, read, model, views.find((view) => view.resource === model.name && !view.roles))
  const per = read.limitPer?.field
  const params = [...filterParam, ...(sort ? [`order_by=${sortText(sort)}`] : []), ...(read.limitPer ? [`limit_per=${read.limitPer.field}:${read.limitPer.count}`] : [])]
  const shape: ReadShape = { resource: model.name, request: `GET /${model.name}${params.length > 0 ? `?${params.join('&')}` : ''}`, from, query: { ...(filter && { filter }), ...(sort && { sort }), ...(per && { per }) } }
  return [shape, ...related]
}

/** The reads of a composed page, as its read plan makes them, each `related()` term's records among them. */
export const pageShapes = (page: PageModel, models: Record<string, ResourceModel>, views: ViewModel[]): ReadShape[] =>
  compileReadPlan(page.tree, { models }).plan.reads.flatMap((read) => readShapes(page, read, models, views))

/** The custom components of a page that declare no reads, which read by themselves once they draw. */
export const unplannedBlocks = (page: PageModel, models: Record<string, ResourceModel>): string[] =>
  compileReadPlan(page.tree, { models }).plan.outside.map(({ type }) => `page "${page.name}", <${type}>`)
