import { where, type FilterExpr, type ResourceModel } from '@protobase/schema'
import { templatePlaceholders } from '@protobase/schema/internal'
import { blockSpecs, type BlockReads } from './block-specs'
import { threadSort } from './check-time'
import { timelineFields, timelineSort } from './check-timeline'
import { defaultPerPage, defaultSort, defaultSource, maxPerPage } from './list-blocks'
import { filterLiteral, filterText, sortText } from './list-query'
import type { LayoutNode, LayoutValue } from './node'
import type { Draft, PlanContext, Rows } from './plan-draft'
import { fieldEquality, keyEquality, splitFilter, type ImpliedSplit, type SplitFilter } from './plan-split'
import { planReadId } from './read-plan'
import { totalOf } from './plan-total'
import { columnName, type TableColumn } from './table-columns'
import { readList, selectOf } from './select-blocks'
import { label, type Scope } from './walk'

// The read a data block makes, from the props its spec's `reads` names and the defaults its web block reads with: a
// block inside a repeated record reads one page per record around it, `limit_per`, and a count there becomes one
// `:aggregate` grouped by the field it splits on.

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)
const number = (value: unknown) => (typeof value === 'number' ? value : undefined)

/** How many records a block reads, as its web block does; `undefined` for the list's own paging. */
const pageSizeOf = (node: LayoutNode, reads: BlockReads): number | undefined => {
  const { limit, perPage } = node.props
  switch (node.type) {
    case 'RecordCard':
    case 'ReferenceField':
      return 1
    case 'CardRow':
      return number(limit) ?? 12
    case 'Table':
    case 'RecordCards':
      return number(limit) ?? 10
    case 'Thread':
      return number(limit) ?? 50
    case 'Timeline':
      return number(limit) ?? maxPerPage
    case 'ReferenceManyField':
      return number(perPage) ?? defaultPerPage
    case 'ReferenceArrayField':
      return number(perPage) ?? maxPerPage
    default: {
      // A custom component's limit is only the prop its reads name, as where it reads by itself; it draws what its read
      // holds, so without one it reads as many as one read holds
      if (node.custom) return (reads.limit === undefined ? undefined : number(node.props[reads.limit])) ?? maxPerPage
      return reads.limit === undefined ? number(limit) : number(node.props[reads.limit])
    }
  }
}

const keyOf = (model: ResourceModel) => model.primaryKey[0]!

// The equality a reference block implies with the record around it
const impliedSplits = (node: LayoutNode, model: ResourceModel): ImpliedSplit[] => {
  if (node.type === 'ReferenceManyField') return [{ field: String(node.props.target), path: text(node.props.source) ?? defaultSource }]
  if (node.type === 'ReferenceArrayField' || node.type === 'ReferenceField') return [{ field: keyOf(model), path: String(node.props.source) }]
  return []
}

const ownFilter = (node: LayoutNode, reads: BlockReads) => filterText(reads.filter === undefined ? undefined : (node.props[reads.filter] as LayoutValue | undefined))

const ownSort = (node: LayoutNode, reads: BlockReads, model: ResourceModel) => {
  if (node.type === 'Thread') return threadSort(String(node.props.time))
  if (node.type === 'Timeline') return timelineSort(node)
  const given = sortText(reads.sort === undefined ? undefined : (node.props[reads.sort] as LayoutValue | undefined))
  if (given !== undefined || !['ReferenceManyField', 'ReferenceArrayField'].includes(node.type)) return given
  return defaultSort(keyOf(model))
}

const placeholders = (value: LayoutValue | undefined): string[] => {
  if (typeof value === 'string') return templatePlaceholders(value)
  if (Array.isArray(value)) return value.flatMap(placeholders)
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(placeholders)
  return []
}

// The fields a custom component's `fields` props name, each a field name or a list of them; one not given names none
const namedFields = (node: LayoutNode, props: string | string[]) =>
  (Array.isArray(props) ? props : [props]).flatMap((prop) => {
    const value = node.props[prop]
    if (typeof value === 'string') return [value]
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
  })

/** The fields a block draws of its own records, every key field included; `undefined` when it draws a set its view decides. */
const ownFields = (node: LayoutNode, reads: BlockReads, model: ResourceModel): Set<string> | undefined => {
  const names = (list: string[]) => new Set([...model.primaryKey, ...list.map((name) => name.split('.')[0]!)])
  switch (node.type) {
    case 'Table': {
      const columns = node.props.columns as TableColumn[] | undefined
      return columns ? names([...columns.map(columnName), ...placeholders(node.props.button)]) : undefined
    }
    case 'Thread':
      return names([String(node.props.sender), String(node.props.time), String(node.props.text), ...(text(node.props.status) ? [String(node.props.status)] : [])])
    case 'Timeline':
      return names(timelineFields(node))
    case 'RecordRow':
      return undefined
    // Without children, it draws the record's title
    case 'ReferenceField':
      return node.children.length > 0 ? names([]) : undefined
    default: {
      if (node.custom && reads.fields !== undefined) return names(namedFields(node, reads.fields))
      const fields = typeof reads.fields === 'string' ? node.props[reads.fields] : undefined
      if (Array.isArray(fields)) return names(fields.map(String))
      return node.custom || node.type === 'RecordCards' ? undefined : names([])
    }
  }
}

/** Whether the block itself changes its records, so its read asks for their ETags. */
const changesOwn = (node: LayoutNode) =>
  (node.type === 'Table' && node.props.bulk === true) || (node.type === 'RecordCards' && Array.isArray(node.props.cardActions) && node.props.cardActions.length > 0)

const numeric = new Set(['integer', 'bigint', 'decimal'])

// A `RecordCard`'s `recordKey` names its one record: `key = <value>`, a whole `{{path}}` planned as any other slot
const keyTerm = (model: ResourceModel, recordKey: string) => {
  const quoted = !numeric.has(model.fields[keyOf(model)]?.type ?? 'text')
  const whole = /^\{\{[^{}]*\}\}$/.test(recordKey.trim())
  if (whole) return `${keyOf(model)} = ${quoted ? `"${recordKey.trim()}"` : recordKey.trim()}`
  return `${keyOf(model)} = ${quoted || !/^-?\d+$/.test(recordKey) ? filterLiteral(recordKey) : recordKey}`
}

// A RecordCard's `recordKey` names its record whatever its `filter` says, which picks the first match only without a key
const sourceFilter = (node: LayoutNode, reads: BlockReads, model: ResourceModel) => {
  const recordKey = node.type === 'RecordCard' ? text(node.props.recordKey) : undefined
  return recordKey === undefined ? ownFilter(node, reads) : keyTerm(model, recordKey)
}

/** How many records the read holds at most: its page, or the API's largest one without a page size. */
export const rowsOf = (draft: Draft) => draft.pageSize ?? maxPerPage

type Shape = Pick<Draft, 'kind' | 'pageSize' | 'limitPer' | 'groupBy'>

// Inside a read of several records, a list reads `n` per record, a reference one per record, and a count is grouped
const shapeOf = (node: LayoutNode, n: number | undefined, parent: Draft | undefined, field: string | undefined, context: PlanContext): Shape => {
  const counts = node.type === 'Stat'
  const many = parent !== undefined && rowsOf(parent) > 1
  if (node.type === 'Chart') {
    if (many) context.problems.push(`${label(node)}: a Chart inside a repeated record cannot be planned, because grouping a chart per record is not implemented`)
    return { kind: 'aggregate', groupBy: [String(node.props.groupBy), ...(text(node.props.splitBy) ? [String(node.props.splitBy)] : [])] }
  }
  if (!many) return counts ? { kind: 'count' } : { kind: 'list', ...(n !== undefined && { pageSize: n }) }
  const parents = rowsOf(parent)
  if (counts) return { kind: 'aggregate', groupBy: [field!], pageSize: Math.min(maxPerPage, parents) }
  if (node.type === 'ReferenceField') return { kind: 'list', pageSize: Math.min(maxPerPage, parents) }
  if (n === undefined) {
    context.problems.push(`${label(node)}: inside a repeated record it needs a limit, so each record's page can be read at once`)
    return { kind: 'list' }
  }
  // One read holds at most the API's largest page, so the records around it may get fewer than `n` each
  if (parents * n > maxPerPage) context.warnings.push(`${label(node)}: ${parents} records around it × ${n} each is more than the ${maxPerPage} records one read holds, so some may show fewer; lower its limit or the one around it`)
  const total = Math.min(maxPerPage, parents * n)
  // A list of keys can point at the same record from several records, so it is not one page per record
  if (node.type === 'ReferenceArrayField') return { kind: 'list', pageSize: total }
  return { kind: 'list', pageSize: total, limitPer: { field: field!, count: n } }
}

// How many values the records around it give a read to split on at most: one each, or for a JSON list of keys as many
// as one read holds, since each list may hold several
const keysOf = ({ parent, column }: SplitFilter, context: PlanContext) =>
  context.models[parent!.resource]?.fields[column!]?.type === 'json' ? maxPerPage : rowsOf(parent!)

// How each record around it finds its rows in the read
const splitOf = ({ parent, field, path }: SplitFilter): Pick<Draft, 'split'> => (parent && field && path !== undefined ? { split: { field, source: path, parent: planReadId(parent) } } : {})

/**
 * The reads a block makes: its own, the row a `Table`'s or bar a `Timeline`'s `select` chose, and any others it makes
 * beside it, such as a nested list's total per record.
 */
export type BlockDrafts = { own?: Draft; chosen?: Draft; extra: Draft[] }

/**
 * The props a block's reads take, its built-in spec's or what a custom component declares, each with its part of the
 * plan: none for a block's one read, the prop of its resource for each of a component's several.
 */
export const readsOf = (node: LayoutNode): Array<{ reads: BlockReads; part?: string }> => {
  if (!node.custom) return blockSpecs[node.type]?.reads ? [{ reads: blockSpecs[node.type]!.reads! }] : []
  if (!node.reads) return []
  return Array.isArray(node.reads) ? node.reads.map((reads) => ({ reads, part: reads.resource })) : [{ reads: node.reads }]
}

// The record a `select` chose is read by its key, which the page's address holds
const chosenOf = (node: LayoutNode, block: string, model: ResourceModel, own: FilterExpr | undefined, context: PlanContext): Draft | undefined => {
  const select = selectOf(node)?.param
  if (select === undefined) return
  // A timeline's bar is its `bar` value, whose first record the timeline shows its children draw
  if (node.type === 'Timeline') {
    const bar = fieldEquality(model, String(node.props.bar), `@params.${select}`, context)
    const filter = own ? where.and(own, bar) : bar
    return { block, part: 'chosen', kind: 'list', resource: model.name, filter, orderBy: timelineSort(node), pageSize: 1, fields: new Set([keyOf(model)]), etag: false }
  }
  return { block, part: 'chosen', kind: 'list', resource: model.name, filter: keyEquality(model, `@params.${select}`, context), pageSize: 1, fields: new Set([keyOf(model)]), etag: false }
}

// A thread's tool calls: the latest `limit` of their own resource and filter, newest first
const callsOf = (node: LayoutNode, block: string, scope: Scope, rows: Rows, context: PlanContext): Draft[] => {
  const calls = node.type === 'Thread' ? (node.props.calls as Record<string, string> | undefined) : undefined
  const model = calls && context.models[calls.resource!]
  if (!calls || !model) return []
  const split = splitFilter(model, calls.filter, [], scope, rows, context)
  const shape = shapeOf(node, number(node.props.limit) ?? 50, split.parent, split.field, context)
  const named = ['name', 'time', 'status', 'input', 'result', 'error'].flatMap((name) => (calls[name] ? [calls[name]!] : []))
  return [{ block, part: 'calls', ...shape, resource: model.name, ...(split.filter && { filter: split.filter }), ...splitOf(split), orderBy: threadSort(calls.time!), fields: new Set([keyOf(model), ...named]), etag: false }]
}

// One read of a block, named `part` among a component's several, with the row its `select` chose
const readDrafts = (node: LayoutNode, block: string, { reads, part }: { reads: BlockReads; part?: string }, scope: Scope, rows: Rows, context: PlanContext): Omit<BlockDrafts, 'extra'> & { total?: Draft } => {
  const resource = text(node.props[reads.resource])
  const model = resource === undefined ? undefined : context.models[resource]
  if (!model) return {}
  const split = splitFilter(model, sourceFilter(node, reads, model), impliedSplits(node, model), scope, rows, context)
  const shape = shapeOf(node, pageSizeOf(node, reads), split.parent, split.field, context)
  const orderBy = shape.kind === 'count' ? undefined : ownSort(node, reads, model)
  const own: Draft = {
    block,
    ...(part !== undefined && { part }),
    ...shape,
    resource: model.name,
    ...(split.filter && { filter: split.filter }),
    ...splitOf(split),
    ...(orderBy !== undefined && { orderBy }),
    fields: shape.kind === 'list' ? ownFields(node, reads, model) : shape.kind === 'count' ? new Set([keyOf(model)]) : undefined,
    etag: changesOwn(node),
  }
  const chosen = !node.custom || reads.select !== undefined ? chosenOf(node, block, model, split.filter, context) : undefined
  const total = split.parent && totalOf(node, own, keysOf(split, context))
  return { own, ...(chosen && { chosen }), ...(total && { total }) }
}

export const blockDrafts = (node: LayoutNode, block: string, scope: Scope, rows: Rows, context: PlanContext): BlockDrafts => {
  const made = readsOf(node).map((read) => readDrafts(node, block, read, scope, rows, context))
  const chosen = made.find((each) => each.chosen)?.chosen
  // A component's several reads are each a part of its own; a block's one read is its own
  const own = made.find((each) => each.own && each.own.part === undefined)?.own
  const parts = made.flatMap((each) => (each.own?.part !== undefined ? [each.own] : []))
  const totals = made.flatMap((each) => (each.total ? [each.total] : []))
  return { ...(own && { own }), ...(chosen && { chosen }), extra: [...parts, ...callsOf(node, block, scope, rows, context), ...totals] }
}
