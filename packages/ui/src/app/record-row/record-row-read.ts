import { createWhere, parseFilter, printFilter, type FilterExpr, type ResourceModel, type ViewModel } from '@protobase/schema'
import { loadedFields } from '../displays/list-displays'
import { defaultOrderBy } from '../list-order'

const where = createWhere()

// The filter a row loads with: its own, narrowed to `scope`
const scoped = (filter: string, scope: FilterExpr | undefined) => {
  if (!scope) return filter
  const parsed = parseFilter(filter)
  if (!parsed.ok) throw new Error(`The filter cannot be read: ${parsed.errors.map((error) => error.message).join('; ')}`)
  return printFilter(parsed.ast ? where.and(parsed.ast, scope) : scope)
}

/** What a record row loads its records with: the fields its view's displays show, its filter narrowed to `scope`, and its order, the list's when `sort` is empty. */
export const recordRowRead = (model: ResourceModel, view: ViewModel | undefined, { filter, sort, scope }: { filter: string; sort: string; scope?: FilterExpr }) => ({
  columns: loadedFields(model, view, []),
  filter: scoped(filter, scope),
  orderBy: sort || defaultOrderBy(model, view),
})
