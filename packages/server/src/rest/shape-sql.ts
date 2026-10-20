import { sql } from 'kysely'
import { pathName } from './field-path'
import { fieldSql } from './filter-sql'
import type { OrderTerm } from './parse-order'
import type { SelectItem } from './parse-select'

/**
 * The select list of `select` on the rows of `source`: `*` its columns, a field under its alias, its JSON path's last
 * key or its column, cast when asked. Cast types are checked to be bare type names when parsed.
 */
export const selectSql = (source: string, items: readonly SelectItem[]) =>
  sql.join(items.map((item) => {
    if (item.kind === 'all') return sql`${sql.id(source)}.*`
    const value = fieldSql(source, item.field)
    const cast = item.cast === undefined ? value : sql`cast(${value} as ${sql.raw(item.cast)})`
    return sql`${cast} as ${sql.id(item.alias ?? pathName(item.field))}`
  }))

/** ` order by ...` for the terms; nothing without any. */
export const orderSql = (source: string, terms: readonly OrderTerm[]) =>
  terms.length === 0
    ? sql``
    : sql` order by ${sql.join(terms.map((term) => sql`${fieldSql(source, term.field)}${sql.raw(term.direction ? ` ${term.direction}` : '')}${sql.raw(term.nulls ? ` nulls ${term.nulls}` : '')}`))}`

/** ` limit ... offset ...` for the range. */
export const rangeSql = (range: { offset: number; limit?: number }) =>
  sql`${range.limit === undefined ? sql`` : sql` limit ${range.limit}`}${range.offset === 0 ? sql`` : sql` offset ${range.offset}`}`
