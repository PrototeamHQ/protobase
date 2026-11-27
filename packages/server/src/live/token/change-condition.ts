import type { CheckedFilter, CompareOp, FieldModel, FieldType, FilterValue, KeyType } from '@protobase/schema'
import { changeConstant, type Constant } from './change-constant'

/** A condition on one changed row in the change stream's JSON format, on the table's columns. */
export type ChangeCondition =
  | { eq: [string, Constant] }
  | { neq: [string, Constant] }
  | { lt: [string, Constant] }
  | { lte: [string, Constant] }
  | { gt: [string, Constant] }
  | { gte: [string, Constant] }
  | { in: [string, Constant[]] }
  | { is_null: string }
  | { and: ChangeCondition[] }
  | { or: ChangeCondition[] }
  | { not: ChangeCondition }

const operators = { '=': 'eq', '!=': 'neq', '<': 'lt', '<=': 'lte', '>': 'gt', '>=': 'gte' } as const

// `=` and `!=` on text with a `*` match a pattern, which the stream has no form of.
const isPattern = (field: FieldModel, op: CompareOp, value: FilterValue) =>
  field.type === 'text' && (op === '=' || op === '!=') && value.kind === 'string' && value.value.includes('*')

/** The types of the key of a resource, one per part; undefined for one the app does not have. */
export type KeyTypesOf = (resource: string) => KeyType[] | undefined

// The type a field's column compares as: a relation's that of the one-part key it points at, undefined for any other.
const comparedType = (field: FieldModel, keyTypesOf: KeyTypesOf): FieldType | undefined => {
  if (field.type !== 'relation') return field.type
  const types = field.relation ? keyTypesOf(field.relation.resource) : undefined
  return types?.length === 1 && field.relation!.columns.length <= 1 ? types[0] : undefined
}

/**
 * A checked filter on the row alone (`sameRowFilter`) as a condition of the change stream, which then lets in the rows
 * Postgres would. Undefined when a part has no such form: a search, `similar`, `regex`, a JSON field's `has` or
 * `present`, a text pattern, a lookup field, a relation to a key of several parts, or a value `changeConstant` leaves out.
 * `keyTypesOf` gives the key types of the resource a relation points at.
 */
export const changeCondition = (filter: CheckedFilter, keyTypesOf: KeyTypesOf): ChangeCondition | undefined => {
  if (filter.kind === 'and' || filter.kind === 'or') {
    const args = filter.args.map((arg) => changeCondition(arg, keyTypesOf))
    if (args.some((arg) => arg === undefined)) return
    return filter.kind === 'and' ? { and: args as ChangeCondition[] } : { or: args as ChangeCondition[] }
  }
  if (filter.kind === 'not') {
    const arg = changeCondition(filter.arg, keyTypesOf)
    return arg && { not: arg }
  }
  if (filter.kind === 'search' || filter.field.lookup) return
  const column = filter.field.column
  if (filter.kind === 'isNull') return { is_null: column }
  if (filter.kind === 'present') return filter.field.type === 'json' ? undefined : { not: { is_null: column } }
  if (filter.kind === 'compare') {
    if (isPattern(filter.field, filter.op, filter.value)) return
    const type = comparedType(filter.field, keyTypesOf)
    const name = operators[filter.op]
    const value = type && changeConstant(type, filter.value, name !== 'eq' && name !== 'neq')
    if (value === undefined) return
    return { [name]: [column, value] } as ChangeCondition
  }
  if (filter.kind === 'in') {
    const type = comparedType(filter.field, keyTypesOf)
    if (!type) return
    const values = filter.values.map((value) => changeConstant(type, value, false))
    if (values.length === 0 || values.some((value) => value === undefined)) return
    return { in: [column, values as Constant[]] }
  }
  return
}
