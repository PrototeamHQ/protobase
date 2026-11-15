import type { ResourceModel } from '@protobase/schema'
import { templatePlaceholders } from '@protobase/schema/internal'
import { blockSpecs, type BlockReads } from './block-specs'
import { threadSort } from './check-time'
import { defaultPerPage, defaultSort, defaultSource, maxPerPage } from './list-blocks'
import { allOf, filterLiteral, filterText, sortText } from './list-query'
import type { LayoutNode, LayoutValue } from './node'
import type { Draft, PlanContext, Rows } from './plan-draft'
import { keyEquality, splitFilter, type ImpliedSplit } from './plan-split'
import { columnName, type TableColumn } from './table-columns'
import { selectBlocks } from './select-blocks'
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
    case 'ReferenceManyField':
      return number(perPage) ?? defaultPerPage
    case 'ReferenceArrayField':
      return number(perPage) ?? maxPerPage
    default:
      return reads.limit === undefined ? number(limit) : number(node.props[reads.limit])
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

/** The fields a block draws of its own records, the key included; `undefined` when it draws a set its view decides. */
const ownFields = (node: LayoutNode, reads: BlockReads, model: ResourceModel): Set<string> | undefined => {
  const key = keyOf(model)
  const names = (list: string[]) => new Set([key, ...list.map((name) => name.split('.')[0]!)])
  switch (node.type) {
    case 'Table': {
      const columns = node.props.columns as TableColumn[] | undefined
      return columns ? names([...columns.map(columnName), ...placeholders(node.props.button)]) : undefined
    }
    case 'Thread':
      return names([String(node.props.sender), String(node.props.time), String(node.props.text), ...(text(node.props.status) ? [String(node.props.status)] : [])])
    case 'RecordRow':
      return undefined
    // Without children, it draws the record's title
    case 'ReferenceField':
      return node.children.length > 0 ? names([]) : undefined
    default: {
      const fields = reads.fields === undefined ? undefined : node.props[reads.fields]
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

const sourceFilter = (node: LayoutNode, reads: BlockReads, model: ResourceModel) => {
  const recordKey = node.type === 'RecordCard' ? text(node.props.recordKey) : undefined
  return allOf(ownFilter(node, reads), recordKey === undefined ? undefined : keyTerm(model, recordKey))
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

/** The reads a block makes: its own, the row a `Table`'s `select` chose, and any others it makes beside it. */
export type BlockDrafts = { own?: Draft; chosen?: Draft; extra: Draft[] }

/** The props a block's reads take: its built-in spec's, or what a custom component declares. */
export const readsOf = (node: LayoutNode): BlockReads | undefined => (node.custom ? node.reads : blockSpecs[node.type]?.reads)

// The record a `select` chose is read by its key, which the page's address holds
const chosenOf = (node: LayoutNode, block: string, model: ResourceModel, context: PlanContext): Draft | undefined => {
  const select = text(node.props.select)
  // A custom component's `select` is its own prop, which names no page parameter
  if (select === undefined || node.custom || !selectBlocks.has(node.type)) return
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
  return [{ block, part: 'calls', ...shape, resource: model.name, ...(split.filter && { filter: split.filter }), orderBy: threadSort(calls.time!), fields: new Set([keyOf(model), ...named]), etag: false }]
}

export const blockDrafts = (node: LayoutNode, block: string, scope: Scope, rows: Rows, context: PlanContext): BlockDrafts => {
  const reads = readsOf(node)
  const resource = reads && text(node.props[reads.resource])
  const model = resource === undefined ? undefined : context.models[resource]
  if (!reads || !model) return { extra: [] }
  const split = splitFilter(model, sourceFilter(node, reads, model), impliedSplits(node, model), scope, rows, context)
  const shape = shapeOf(node, pageSizeOf(node, reads), split.parent, split.field, context)
  const orderBy = shape.kind === 'count' ? undefined : ownSort(node, reads, model)
  const own: Draft = {
    block,
    ...shape,
    resource: model.name,
    ...(split.filter && { filter: split.filter }),
    ...(orderBy !== undefined && { orderBy }),
    fields: shape.kind === 'list' ? ownFields(node, reads, model) : shape.kind === 'count' ? new Set([keyOf(model)]) : undefined,
    etag: changesOwn(node),
  }
  const chosen = chosenOf(node, block, model, context)
  return { own, ...(chosen && { chosen }), extra: callsOf(node, block, scope, rows, context) }
}
