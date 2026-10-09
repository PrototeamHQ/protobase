import { checkFilter, checkOrderBy, parseFilter, parseOrderBy, type FilterError, type ResourceModel } from '@protobase/schema'
import { badRequest } from './problem'

const filterProblem = (parameter: 'filter' | 'order_by', errors: FilterError[]) =>
  badRequest(parameter === 'filter' ? 'invalid-filter' : 'invalid-order-by', `The ${parameter} parameter is invalid: ${errors[0]!.message}`, {
    parameter,
    errors,
  })

/** AIP-160 text to a checked filter; throws a 400 problem carrying the checker's errors with spans and hints. */
export const checkedFilter = (model: ResourceModel, source?: string, maxLength?: number) => {
  if (!source?.trim()) return undefined
  const parsed = parseFilter(source, maxLength ? { maxLength } : {})
  if (!parsed.ok) throw filterProblem('filter', parsed.errors)
  if (!parsed.ast) return undefined
  const checked = checkFilter(model, parsed.ast)
  if (!checked.ok) throw filterProblem('filter', checked.errors)
  return checked.filter
}

/** AIP-132 `order_by` text to a sort spec; throws a 400 problem on any error. */
export const checkedSort = (model: ResourceModel, source?: string) => {
  if (!source?.trim()) return undefined
  const parsed = parseOrderBy(source)
  if (!parsed.ok) throw filterProblem('order_by', parsed.errors)
  const checked = checkOrderBy(model, parsed.items)
  if (!checked.ok) throw filterProblem('order_by', checked.errors)
  return checked.sort
}
