import { checkOrderBy as check, parseOrderBy as parse, printOrderBy as print } from 'aip-parsers/order-by'
import type { FilterError, OrderByItem, ResourceModel, SortSpec } from '../model'
import { filterError } from './errors'
import { schemaOf } from './profile'

/** What `parseOrderBy` gives: the order's items, or the errors. */
export type OrderByParse =
  | {
      /** The text parsed. */
      ok: true
      /** The fields to sort on, in order. */
      items: OrderByItem[]
      /** None. */
      errors: []
    }
  | {
      /** The text did not parse. */
      ok: false
      /** The items that parsed. */
      items: OrderByItem[]
      /** Each problem, with where it is in the text. */
      errors: FilterError[]
    }

/** What `checkOrderBy` gives: the sort, or the errors. */
export type OrderByCheck =
  | {
      /** The order is valid for the resource. */
      ok: true
      /** The fields to sort on and their directions, in order. */
      sort: SortSpec
    }
  | {
      /** The order is not valid for the resource. */
      ok: false
      /** Each problem, with where it is in the text. */
      errors: FilterError[]
    }

const generic = (items: OrderByItem[]) => items.map((item) => ({ path: item.path.path, direction: item.direction, span: item.span }))

// The library accepts only lowercase asc/desc; Protobase also accepts any case. The rewrite keeps
// offsets, and leaves a first word (the field name) alone.
const lowercaseDirections = (source: string) =>
  source.replace(/([^\s,])(\s+)(asc|desc)(?=\s|,|$)/gi, (_, before: string, space: string, word: string) => `${before}${space}${word.toLowerCase()}`)

/** Parses order text, AIP-132 as the API's `order_by` takes it, such as `created_at desc, name`; `asc` and `desc` in any case. */
export const parseOrderBy = (source: string): OrderByParse => {
  const parsed = parse(lowercaseDirections(source))
  const items: OrderByItem[] = parsed.items.map((item) => ({
    path: { kind: 'field', path: item.path, span: item.span },
    direction: item.direction,
    span: item.span,
  }))
  return parsed.ok ? { ok: true, items, errors: [] } : { ok: false, items, errors: parsed.errors }
}

/** The order as text, as `parseOrderBy` reads it. */
export const printOrderBy = (items: OrderByItem[]) => print(generic(items))

/** Validates against sortable fields; traversal is not supported yet. */
export const checkOrderBy = (model: ResourceModel, items: OrderByItem[]): OrderByCheck => {
  const traversal = items
    .filter((item) => item.path.path.length > 1)
    .map((item) => filterError('unsupported-traversal', `Traversal into "${item.path.path.join('.')}" is not supported yet`, 'Sort on fields of this resource only', item.path.span))
  if (traversal.length > 0) return { ok: false, errors: traversal }
  const checked = check(generic(items), schemaOf(model))
  if (!checked.ok) return { ok: false, errors: checked.errors }
  return { ok: true, sort: checked.items.map((item) => [item.path[0]!, item.direction]) }
}
