import { where, type FilterExpr, type ResourceModel } from '@protobase/schema'
import { reads, type Draft, type PlanContext, type Rows } from './plan-draft'
import { parseSlotted, sentinel, slotOf } from './plan-slots'
import { resolveScopePath } from './scope-lookup'
import type { Scope } from './walk'

// A read that takes a value of a record around it, `field = {{path}}`, cannot wait for that record: the equality becomes
// `related(field, resource.column, (filter), "order_by", page_size)`, the outer read itself, which the API reads
// beside it. A value of the page's own record that its address does not hold becomes `related()` on that record by
// its key. Page parameters and the page record's key stay slots, which the address fills before any read.

/** An equality a block implies, such as a `ReferenceManyField`'s `target = {{source}}`. */
export type ImpliedSplit = { field: string; path: string }

/**
 * A planned filter, and the read of the records around it that it splits by, if any, with the field it splits on and
 * the column of the records around it whose value that field holds.
 */
export type SplitFilter = { filter?: FilterExpr; parent?: Draft; field?: string; path?: string; column?: string }

const numeric = new Set(['integer', 'bigint', 'decimal'])

/** `field = {{path}}`: the records of `model` whose `field` holds what `path` does, quoted unless the field is a number. */
export const fieldEquality = (model: ResourceModel, field: string, path: string, context: PlanContext): FilterExpr =>
  where.eq(field, sentinel(context.slots, path, !numeric.has(model.fields[field]?.type ?? 'text')))

/** `key = {{path}}`: the record of `model` whose key `path` holds, quoted unless the key is a number. */
export const keyEquality = (model: ResourceModel, path: string, context: PlanContext): FilterExpr => fieldEquality(model, model.primaryKey[0]!, path, context)

// The outer read's page. One that keeps the first rows per record further out has no page `related()` can say, so
// the term reads all of them for those records, a superset of the rows drawn.
const pageOf = (read: Draft) => (read.pageSize === undefined || read.limitPer ? undefined : { orderBy: read.orderBy ?? '', limit: read.pageSize })

// An address value stays a slot, quoted unless the field it fills is a number.
const addressEquality = (field: string, path: string, model: ResourceModel, context: PlanContext) =>
  where.eq(field, sentinel(context.slots, path, !numeric.has(model.fields[field]?.type ?? 'text')))

/** The term that stands for `field = {{path}}`, or `undefined` when the slot is an address value and stays one. */
const splitTerm = (field: string, path: string, scope: Scope, rows: Rows, context: PlanContext): { term: FilterExpr; parent?: Draft; column?: string } | undefined => {
  const resolved = resolveScopePath(path, { models: context.models, scope, params: context.params, mode: 'stored' })
  if (!resolved.ok || resolved.kind !== 'field') return
  const [column] = resolved.names
  const { at, resource } = resolved.context
  if (at === 'root') {
    const root = context.models[resource]!
    if (root.primaryKey.length === 1 && root.primaryKey[0] === column) return
    return { term: where.related(field, resource, column!, keyEquality(root, `@root.${root.primaryKey[0]}`, context)) }
  }
  const parent = rows[at]
  // The page check refused a slot of an `ArrayField` item in a read
  if (!parent) throw new Error(`"{{${path}}}" is no stored field of a read`)
  reads(parent, column!)
  return { term: where.related(field, parent.resource, column!, parent.filter, pageOf(parent)), parent, column }
}

const conjuncts = (node: FilterExpr): FilterExpr[] => (node.kind === 'and' ? node.args.flatMap(conjuncts) : [node])

/**
 * `source`, a filter of `model`, with `implied` ANDed, planned: each top-level `field = {{path}}` naming a record around it, or the page
 * record's field, turned into its `related()` term.
 */
export const splitFilter = (model: ResourceModel, source: string | undefined, implied: ImpliedSplit[], scope: Scope, rows: Rows, context: PlanContext): SplitFilter => {
  const parsed = parseSlotted(source, context.slots)
  const split: SplitFilter = {}
  const terms: FilterExpr[] = []
  const take = (field: string, path: string) => {
    const found = splitTerm(field, path, scope, rows, context)
    if (!found) return false
    terms.push(found.term)
    if (found.parent) Object.assign(split, { parent: found.parent, field, path, column: found.column })
    return true
  }
  for (const { field, path } of implied) if (!take(field, path)) terms.push(addressEquality(field, path, model, context))
  for (const term of parsed ? conjuncts(parsed) : []) {
    const path = term.kind === 'compare' && term.op === '=' && term.field.kind === 'field' && term.field.path.length === 1 ? slotOf(context.slots, (term.value as { value?: unknown }).value) : undefined
    if (path === undefined || term.kind !== 'compare' || !take(term.field.path[0]!, path)) terms.push(term)
  }
  return { ...split, ...(terms.length > 0 && { filter: where.and(...terms) }) }
}
