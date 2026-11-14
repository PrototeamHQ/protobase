import { relatedPage, type KeyItemType, type Scope } from '@protobase/query'
import { checkOrderBy, parseOrderBy, type CheckedFilter, type FilterError, type RelatedFilter, type ResourceModel } from '@protobase/schema'
import { filterProblem } from './filter-input'
import type { Entry } from './registry'

// An `order_by` inside a filter is refused as the filter, at the term, with what the order's checker found.
const orderProblem = (errors: FilterError[], term: RelatedFilter) => filterProblem('filter', errors.map((error) => ({ ...error, span: term.span })))

/**
 * The page of its resource a `related()` term keeps to, as a list of `model` with `filter` in `scope` reads it for the
 * same `order_by`, `page_size` and `page_token`; undefined without an order, so today's terms read every record.
 */
export const termPage = (model: ResourceModel, term: RelatedFilter, filter: CheckedFilter | undefined, scope: Scope) => {
  if (term.orderBy === undefined) return undefined
  const parsed = term.orderBy.trim() ? parseOrderBy(term.orderBy) : undefined
  if (parsed && !parsed.ok) throw orderProblem(parsed.errors, term)
  const checked = parsed && checkOrderBy(model, parsed.items)
  if (checked && !checked.ok) throw orderProblem(checked.errors, term)
  const sort = checked?.sort
  return relatedPage(model, { ...(sort && { sort }), ...(term.limit !== undefined && { limit: term.limit }), ...(term.pageToken !== undefined && { cursor: term.pageToken }) }, filter, scope)
}

/** The Postgres type a JSON list of keys of the entry's resource holds them as: its single key's. */
export const keyItemType = (entry: Entry | undefined): KeyItemType | undefined => (entry?.keyTypes.length === 1 ? entry.keyTypes[0] : undefined)
