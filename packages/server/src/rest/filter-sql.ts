import { sql, type RawBuilder } from 'kysely'
import type { FieldPath } from './field-path'
import type { Condition, Filter, Operator } from './parse-filter'

/** A field of the row source named `source`: `"todos"."meta"->$1::text`. Every key is a parameter. */
export const fieldSql = (source: string, path: FieldPath): RawBuilder<unknown> =>
  path.json.reduce<RawBuilder<unknown>>(
    (value, step) => sql`(${value}${sql.raw(step.arrow)}${typeof step.key === 'number' ? sql`${step.key}::integer` : sql`${step.key}::text`})`,
    sql`${sql.id(source, path.column)}`,
  )

const comparisons: Partial<Record<Operator, string>> = {
  eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike', match: '~', imatch: '~*',
  isdistinct: 'is distinct from', cs: '@>', cd: '<@', ov: '&&', sl: '<<', sr: '>>', nxr: '&<', nxl: '&>', adj: '-|-',
}
const tsQueries: Partial<Record<Operator, string>> = { fts: 'to_tsquery', plfts: 'plainto_tsquery', phfts: 'phraseto_tsquery', wfts: 'websearch_to_tsquery' }
const isTests = { null: 'is null', not_null: 'is not null', true: 'is true', false: 'is false', unknown: 'is unknown' } as const

/** A Postgres array literal of the values, each quoted, so Postgres reads it as an array of the column's type. */
export const arrayLiteral = (values: readonly string[]) => `{${values.map((value) => `"${value.replace(/[\\"]/g, '\\$&')}"`).join(',')}}`

// `*` stands for `%` in a pattern, as URLs mangle `%`.
const pattern = (operator: Operator, value: string) => (operator === 'like' || operator === 'ilike' ? value.replaceAll('*', '%') : value)

const conditionSql = (source: string, condition: Condition): RawBuilder<unknown> => {
  const field = fieldSql(source, condition.field)
  const { operator, value } = condition
  if (operator === 'in') return sql`${field} = any(${arrayLiteral(value as string[])})`
  if (operator === 'is') return sql`${field} ${sql.raw(isTests[value as keyof typeof isTests])}`
  const text = pattern(operator, value as string)
  const tsQuery = tsQueries[operator]
  if (tsQuery) return condition.language === undefined ? sql`${field} @@ ${sql.raw(tsQuery)}(${text})` : sql`${field} @@ ${sql.raw(tsQuery)}(${condition.language}, ${text})`
  const comparison = sql.raw(comparisons[operator]!)
  if (condition.quantifier) return sql`${field} ${comparison} ${sql.raw(condition.quantifier)}(${text})`
  return sql`${field} ${comparison} ${text}`
}

/** A filter as a condition on the rows of `source`; every value is a parameter, every name a quoted identifier. */
export const filterSql = (source: string, filter: Filter): RawBuilder<unknown> => {
  const condition =
    filter.kind === 'condition' ? conditionSql(source, filter)
    : filter.args.length === 0 ? sql.raw(filter.kind === 'and' ? 'true' : 'false')
    : sql`(${sql.join(filter.args.map((arg) => filterSql(source, arg)), sql.raw(` ${filter.kind} `))})`
  return filter.negated ? sql`not (${condition})` : condition
}

/** ` where ...` for the filters, all of which hold; nothing without any. */
export const whereSql = (source: string, filters: readonly Filter[]) =>
  filters.length === 0 ? sql`` : sql` where ${sql.join(filters.map((filter) => filterSql(source, filter)), sql` and `)}`
