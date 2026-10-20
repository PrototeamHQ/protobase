import { parseFieldPath, type FieldPath } from './field-path'
import { parseError } from './rest-error'
import { splitList, unquote } from './split-list'

export const operators = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'match', 'imatch', 'in', 'is', 'isdistinct',
  'fts', 'plfts', 'phfts', 'wfts', 'cs', 'cd', 'ov', 'sl', 'sr', 'nxr', 'nxl', 'adj',
] as const
export type Operator = (typeof operators)[number]

/** The operators that compare with `any` or `all` of a list, `eq(any).{1,2}`. */
const quantifiable = new Set<Operator>(['eq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'match', 'imatch'])
/** The full text search operators, which take a language, `fts(english).cat`. */
export const textSearch = new Set<Operator>(['fts', 'plfts', 'phfts', 'wfts'])
export const isValues = ['null', 'not_null', 'true', 'false', 'unknown'] as const

/**
 * One condition on a field. `value` is the text after the operator, an array literal such as `{1,2}` for a
 * quantified operator, the list of `in`, or one of `isValues` for `is`.
 */
export type Condition = {
  kind: 'condition'
  field: FieldPath
  negated: boolean
  operator: Operator
  quantifier?: 'any' | 'all'
  language?: string
  value: string | string[]
}
export type Logic = { kind: 'and' | 'or'; negated: boolean; args: Filter[] }
export type Filter = Condition | Logic

const isOperator = (name: string): name is Operator => (operators as readonly string[]).includes(name)

const inList = (text: string) => {
  if (!text.startsWith('(') || !text.endsWith(')')) throw parseError(`"failed to parse filter (in.${text})"`, 'in takes a list in parentheses, such as in.(1,2)')
  const inner = text.slice(1, -1)
  return inner.trim() === '' ? [] : splitList(inner).map(unquote)
}

/**
 * Parses what a filter says of `field`: `[not.]operator[(modifier)].value`. In a logic tree a value in double quotes
 * loses them, so it may hold commas and parentheses.
 */
export const parseCondition = (field: FieldPath, text: string, inTree = false): Condition => {
  const negated = text.startsWith('not.')
  const rest = negated ? text.slice(4) : text
  const match = /^(\w+)(?:\((\w+)\))?\.([\s\S]*)$/.exec(rest)
  const [, name = '', modifier, value = ''] = match ?? []
  if (!match || !isOperator(name)) throw parseError(`"failed to parse filter (${text})"`, `"${name || text}" is not an operator`)
  const condition = { kind: 'condition', field, negated, operator: name } as const
  if (name === 'in') return { ...condition, value: inList(value) }
  if (name === 'is') {
    if (!(isValues as readonly string[]).includes(value)) throw parseError(`"failed to parse filter (${text})"`, `is takes one of ${isValues.join(', ')}`)
    return { ...condition, value }
  }
  const plain = inTree ? unquote(value) : value
  if (modifier === undefined) return { ...condition, value: plain }
  if (textSearch.has(name)) return { ...condition, language: modifier, value: plain }
  if ((modifier === 'any' || modifier === 'all') && quantifiable.has(name)) return { ...condition, quantifier: modifier, value: plain }
  throw parseError(`"failed to parse filter (${text})"`, `${name} takes no "${modifier}"`)
}

const treeItem = (text: string): Filter => {
  const nested = /^(not\.)?(and|or)(\([\s\S]*\))$/.exec(text)
  if (nested) return parseLogic(nested[2] as Logic['kind'], Boolean(nested[1]), nested[3]!)
  const dot = text.indexOf('.')
  if (dot <= 0) throw parseError(`"failed to parse logic tree (${text})"`, 'Each condition is field.operator.value')
  return parseCondition(parseFieldPath(text.slice(0, dot)), text.slice(dot + 1), true)
}

/** Parses the value of `or=`, `and=`, `not.or=` or `not.and=`: `(item,item,...)`, items nesting `and(...)` and `or(...)`. */
export const parseLogic = (kind: Logic['kind'], negated: boolean, text: string): Logic => {
  if (!text.startsWith('(') || !text.endsWith(')')) throw parseError(`"failed to parse logic tree (${text})"`, 'A logic tree is a list in parentheses')
  return { kind, negated, args: splitList(text.slice(1, -1)).map((item) => treeItem(item.trim())) }
}

/** The filter of one query parameter: `column=op.value`, or a logic tree under `or`, `and`, `not.or` or `not.and`. */
export const parseFilter = (key: string, value: string): Filter => {
  const logic = /^(not\.)?(and|or)$/.exec(key)
  if (logic) return parseLogic(logic[2] as Logic['kind'], Boolean(logic[1]), value)
  return parseCondition(parseFieldPath(key), value)
}
