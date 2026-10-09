import { checkFilter as check } from 'aip-parsers/filter'
import type { CheckedFilter, FilterError, FilterExpr, ResourceModel } from '../model'
import { checkAgainstModel } from './check-model'
import { lift } from './lift'
import { schemaOf } from './profile'

export type CheckResult =
  | { ok: true; filter: CheckedFilter }
  | { ok: false; errors: FilterError[] }

/**
 * Validates against the resource: the library checks fields, aliases, filterability, enum
 * values, operators and function signatures; the model pass then checks the value formats the
 * library cannot know (decimal, bigint, uuid, date, ...), traversal and search fields.
 */
export const checkFilter = (model: ResourceModel, ast: FilterExpr): CheckResult => {
  const traversal = checkAgainstModel(model, ast)
  if (!traversal.ok && traversal.errors.some((e) => e.code === 'unsupported-traversal')) return traversal
  const generic = check(lift(ast), schemaOf(model))
  if (!generic.ok) return { ok: false, errors: generic.errors }
  return checkAgainstModel(model, ast)
}
