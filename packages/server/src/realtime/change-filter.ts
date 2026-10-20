import { sql, type RawBuilder } from 'kysely'
import { quoteIdent } from '../changes/capture-sql'

/** The operators of a `postgres_changes` filter, as Supabase Realtime takes them, and the SQL each is. */
const operators = {
  eq: '=',
  neq: '<>',
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
  in: '= any',
  like: 'like',
  ilike: 'ilike',
  match: '~',
  imatch: '~*',
  is: 'is',
  isdistinct: 'is distinct from',
} as const

export type FilterOperator = keyof typeof operators

/** One `column=op.value` condition; `in` keeps its list as an array literal, `{a,b}`. */
export type FilterCondition = { column: string; operator: FilterOperator; value: string; negate: boolean }

const isOperator = (name: string): name is FilterOperator => Object.hasOwn(operators, name)

const isKeyword = new Set(['null', 'true', 'false', 'unknown'])

// Splits at the commas outside parentheses and double quotes, as Supabase does.
const segments = (filter: string) => {
  const parts: string[] = []
  let current = ''
  let depth = 0
  let quoted = false
  for (let index = 0; index < filter.length; index++) {
    const char = filter[index]!
    if (quoted && char === '\\') {
      current += char + (filter[++index] ?? '')
      continue
    }
    if (char === '"' && (quoted || ['.', '(', ','].includes(current.at(-1) ?? ','))) quoted = !quoted
    else if (!quoted && char === '(') depth++
    else if (!quoted && char === ')') depth = Math.max(0, depth - 1)
    else if (!quoted && depth === 0 && char === ',') {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  return [...parts, current]
}

// A value in double quotes loses them and its backslash escapes.
const unquote = (value: string) => {
  if (!value.startsWith('"') || !value.endsWith('"') || value.length < 2) return value
  return value.slice(1, -1).replace(/\\(.)/g, '$1')
}

const condition = (segment: string): FilterCondition | string => {
  const trimmed = segment.trim()
  if (trimmed === '') return 'filter must not contain empty segments (check for extra commas)'
  const equals = trimmed.indexOf('=')
  if (equals < 1) return `invalid filter "${trimmed}": use column=operator.value`
  const column = trimmed.slice(0, equals)
  let rest = trimmed.slice(equals + 1)
  const negate = rest.startsWith('not.')
  if (negate) rest = rest.slice(4)
  const dot = rest.indexOf('.')
  if (dot < 0) return `invalid filter "${trimmed}": use column=operator.value`
  const operator = rest.slice(0, dot)
  const value = rest.slice(dot + 1)
  if (!isOperator(operator)) return `invalid filter "${trimmed}": unknown operator "${operator}"`
  if (operator === 'in') {
    if (!value.startsWith('(') || !value.endsWith(')')) return '`in` filter value must be wrapped by parentheses'
    return { column, operator, value: `{${value.slice(1, -1)}}`, negate }
  }
  if (operator === 'is' && !isKeyword.has(value)) return 'invalid value for is filter: must be null, true, false, or unknown'
  return { column, operator, value: unquote(value), negate }
}

/** The conditions of a filter, all of which a row must meet; an error message for one Supabase refuses too. */
export const parseFilter = (filter: string | undefined): FilterCondition[] | string => {
  if (filter === undefined || filter.trim() === '') return []
  const parsed = segments(filter.trim()).map(condition)
  const error = parsed.find((item) => typeof item === 'string')
  return error ?? (parsed as FilterCondition[])
}

// One condition on the row `alias`, the value bound as a parameter whose type Postgres takes from the column.
const conditionSql = (alias: string, { column, operator, value, negate }: FilterCondition) => {
  const target = sql.raw(`${alias}.${quoteIdent(column)}`)
  const test =
    operator === 'is'
      ? sql`${target} is ${sql.raw(value)}`
      : operator === 'in'
        ? sql`${target} = any(${value})`
        : sql`${target} ${sql.raw(operators[operator])} ${value}`
  return negate ? sql`not (${test})` : test
}

/**
 * Whether the row `alias` meets every condition, as a boolean that is never null: a condition Postgres answers with
 * null, such as one on a null column, is not met, as on Supabase.
 */
export const filterSql = (alias: string, conditions: readonly FilterCondition[]): RawBuilder<boolean> =>
  conditions.length === 0 ? sql<boolean>`true` : sql<boolean>`coalesce(${sql.join(conditions.map((item) => conditionSql(alias, item)), sql` and `)}, false)`
