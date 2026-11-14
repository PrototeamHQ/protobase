import type { ResourceModel } from '@protobase/schema'
import { isScopeField } from './check-condition'
import { isLayoutNode, type LayoutChild, type LayoutNode, type LayoutValue } from './node'
import { blockDrafts, type BlockDrafts } from './plan-block'
import { finalRead, reads, type Draft, type PlanContext, type Rows } from './plan-draft'
import { changesRecord, conditionPaths, readScopeFields } from './plan-fields'
import { pageInputs } from './page-params'
import { newSlots } from './plan-slots'
import type { ReadPlan, UnplannedBlock } from './read-plan'
import { columnName, type TableColumn } from './table-columns'
import { childScope, label, propScope, type Scope } from './walk'

export type ReadPlanInput = {
  models: Record<string, ResourceModel>
  /** The resource of the page's own record, on a page that has one (`@root`). */
  root?: string
}

const pointerName = (name: string) => name.replaceAll('~', '~0').replaceAll('/', '~1')

const elementsOf = (value: LayoutValue): LayoutNode[] => {
  if (isLayoutNode(value)) return [value]
  return Array.isArray(value) && value.length > 0 && value.every(isLayoutNode) ? value : []
}

// The read holding the record an element pushes: its own, the row its `select` chose, or one of the list around it
const pushedRead = (node: LayoutNode, made: BlockDrafts, scope: Scope, list: Draft | undefined) => {
  if (node.type === 'RecordsIterator') return scope.list?.items ? undefined : list
  return made.chosen ?? made.own
}

// A `Table` without `resource` draws the list around it: its columns are that list's fields
const drawList = (node: LayoutNode, list: Draft | undefined) => {
  if (node.custom || node.type !== 'Table' || node.props.resource !== undefined || !list) return
  const columns = node.props.columns as TableColumn[] | undefined
  if (!columns) list.fields = undefined
  for (const column of columns ?? []) reads(list, columnName(column).split('.')[0]!)
  if (node.props.bulk === true) list.etag = true
}

/**
 * The read plan of a page's or a record view's tree: one read per data block, none waiting for another, with the
 * problems that keep a block from being planned. A `{{path}}` of a record around a block becomes a `related()` term
 * carrying the read of that record; the fields each read asks for are those drawn in its scope.
 */
export const compileReadPlan = (tree: LayoutNode, { models, root }: ReadPlanInput): { plan: ReadPlan; problems: string[] } => {
  const context: PlanContext = { models, params: new Set(pageInputs(tree).keys()), slots: newSlots(), problems: [] }
  const drafts: Array<{ draft: Draft; at: string }> = []
  const counts = new Map<string, Draft>()
  const outside: UnplannedBlock[] = []

  const countsOf = (node: LayoutNode, scope: Scope, pointer: string) => {
    const field = isScopeField({ models, scope, params: context.params })
    for (const name of ['when', 'working']) {
      const when = node.props[name]
      if (node.custom || typeof when !== 'string') continue
      for (const resource of conditionPaths(when, field).counts) {
        const model = models[resource]
        if (model && !counts.has(resource)) counts.set(resource, { block: pointer, part: 'condition', kind: 'count', resource, fields: new Set([model.primaryKey[0]!]), etag: false })
      }
    }
  }

  const visit = (node: LayoutNode, scope: Scope, rows: Rows, list: Draft | undefined, pointer: string, at: string) => {
    if (node.custom && !node.reads) outside.push({ block: pointer, type: node.type })
    const made = blockDrafts(node, pointer, scope, rows, context)
    for (const draft of [made.own, made.chosen, ...made.extra]) if (draft) drafts.push({ draft, at })
    readScopeFields(node, scope, rows, context)
    countsOf(node, scope, pointer)
    drawList(node, list)
    const nearest = rows.at(-1)
    if (changesRecord(node) && nearest) nearest.etag = true

    const inner = childScope(node, scope)
    const pushed = inner.stack.length > scope.stack.length
    const innerRows = pushed ? [...rows, pushedRead(node, made, scope, list)] : rows
    const innerList = pushed ? undefined : inner.list !== scope.list ? made.own : list
    const walk = (child: LayoutChild, childScope: Scope, childRows: Rows, childList: Draft | undefined, childPointer: string, place: string) => {
      if (typeof child !== 'string') visit(child, childScope, childRows, childList, childPointer, place)
    }
    node.children.forEach((child, index) => walk(child, inner, innerRows, innerList, `${pointer}/children/${index}`, typeof child === 'string' ? at : `${at} › ${label(child)}`))
    const slot = propScope(node, scope)
    const slotted = slot === scope ? { rows, list } : { rows: innerRows, list: innerList }
    for (const [name, value] of Object.entries(node.props)) {
      const elements = elementsOf(value)
      elements.forEach((element, index) => walk(element, slot, slotted.rows, slotted.list, `${pointer}/props/${pointerName(name)}${Array.isArray(value) ? `/${index}` : ''}`, `${at} ${name}={${label(element)}}`))
    }
    node.fallback?.forEach((child, index) => walk(child, scope, rows, list, `${pointer}/fallback/${index}`, typeof child === 'string' ? at : `${at} fallback={${label(child)}}`))
  }

  visit(tree, { stack: [], ...(root !== undefined && { root }) }, [], undefined, '', label(tree))
  const planned = [...drafts.map(({ draft, at }) => finalRead(draft, context, at)), ...[...counts.values()].map((draft) => finalRead(draft, context, label(tree)))]
  return { plan: { reads: planned, outside }, problems: context.problems }
}
