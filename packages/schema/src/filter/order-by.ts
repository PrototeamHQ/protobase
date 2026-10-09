import { checkOrderBy as check, parseOrderBy as parse, printOrderBy as print } from 'aip-parsers/order-by'
import type { FilterError, OrderByItem, ResourceModel, SortSpec } from '../model'
import { filterError } from './errors'
import { schemaOf } from './profile'

export type OrderByParse =
  | { ok: true; items: OrderByItem[]; errors: [] }
  | { ok: false; items: OrderByItem[]; errors: FilterError[] }

export type OrderByCheck =
  | { ok: true; sort: SortSpec }
  | { ok: false; errors: FilterError[] }

const generic = (items: OrderByItem[]) => items.map((item) => ({ path: item.path.path, direction: item.direction, span: item.span }))

// The library accepts only lowercase asc/desc; Protobase also accepts any case. The rewrite keeps
// offsets, and leaves a first word (the field name) alone.
const lowercaseDirections = (source: string) =>
  source.replace(/([^\s,])(\s+)(asc|desc)(?=\s|,|$)/gi, (_, before: string, space: string, word: string) => `${before}${space}${word.toLowerCase()}`)

export const parseOrderBy = (source: string): OrderByParse => {
  const parsed = parse(lowercaseDirections(source))
  const items: OrderByItem[] = parsed.items.map((item) => ({
    path: { kind: 'field', path: item.path, span: item.span },
    direction: item.direction,
    span: item.span,
  }))
  return parsed.ok ? { ok: true, items, errors: [] } : { ok: false, items, errors: parsed.errors }
}

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
