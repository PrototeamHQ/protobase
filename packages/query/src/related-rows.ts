import { sql, type AliasedRawBuilder, type Expression, type SelectQueryBuilder, type SqlBool } from 'kysely'
import type { CheckedFilter, KeyValue, ResourceModel, SortSpec } from '@protobase/schema'
import { baseQuery } from './base-query'
import { columnRef, findField } from './columns'
import type { Db } from './db'
import { QueryError } from './errors'
import { maxLimit } from './list-query'
import { orderTerm } from './order'
import type { Scope } from './scope'
import { effectiveSort } from './sort'
import { rankAlias } from './internal-aliases'

/** The values of `field` a per-value read keeps: those among `values` when given, else every one the filter keeps. */
export type PerValue = {
  /** The field the rows are counted per, such as a photo's `listing_id`. */
  field: string
  /** The values to read rows of; every value of the rows the filter keeps when omitted. */
  values?: readonly KeyValue[]
  /** The rows it keeps, on both sides of the join: the values and the rows of each. */
  filter?: CheckedFilter
}

/** The rows of `model` per value of `field`, at most `limit` for each value, in `sort` order. */
export type RelatedRowsQuery = PerValue & {
  /** The fields it reads, by name; `field` is always among them. */
  columns: string[]
  /** The order within each value; the primary key decides ties. */
  sort?: SortSpec
  limit: number
  /** The most rows it reads over all values together; no cap when omitted. */
  total?: number
}

export const ownerAlias = '__pb_owner'
export { rankAlias }

type AnySelect = SelectQueryBuilder<any, any, any>

/** Refuses a per-value limit outside a list's page sizes. */
export const checkPerLimit = (limit: number) => {
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) throw new QueryError('invalid_limit', `limit must be a whole number from 1 to ${maxLimit}`)
}

/**
 * The values of `per.field` that have rows, each joined to the rows `rowsOf` reads for it by a lateral subquery, so an
 * index on the field and the order under it reads only those rows. `rowsOf` gets the condition that keeps a row to the
 * value and selects `rankAlias`, its place within the value; the result runs by value, then by that place. The field is
 * matched with `=`, so rows whose field is null have no value and are never read. Both sides stay inside the scope.
 */
export const firstPerValue = (db: Db, model: ResourceModel, per: PerValue, scope: Scope | undefined, rowsOf: (sameValue: Expression<SqlBool>) => AnySelect) => {
  const owner = findField(model, per.field)
  if (owner.type === 'json') throw new QueryError('unsupported_field_type', `Cannot read rows per value of "${per.field}", which is json`)
  let owners = baseQuery(db, model, per.filter, scope)
    .select(sql`${columnRef(owner)}`.as(ownerAlias))
    .distinct()
  if (per.values) owners = owners.where(sql<SqlBool>`${columnRef(owner)} in (${sql.join(per.values)})`)
  const sameValue = sql<SqlBool>`${columnRef(owner)} = ${sql.ref(`k.${ownerAlias}`)}`
  return db
    .selectFrom(owners.as('k'))
    .innerJoinLateral(rowsOf(sameValue).as('r'), join => join.onTrue())
    .orderBy(sql.ref(`k.${ownerAlias}`))
    .orderBy(sql.ref(`r.${rankAlias}`))
}

/**
 * The query `relatedRows` runs: per value of `field`, its first `limit` rows in `sort` order, with `extra` selected
 * beside the columns. The result runs by value, then by `sort` within each value.
 */
export const buildRelatedRows = (db: Db, model: ResourceModel, query: RelatedRowsQuery, scope?: Scope, extra: Array<AliasedRawBuilder<unknown, string>> = []) => {
  checkPerLimit(query.limit)
  const columns = [...new Set([query.field, ...query.columns])].map(name => findField(model, name))
  const order = effectiveSort(model, query.sort).map(key => orderTerm(key))
  const built = firstPerValue(db, model, query, scope, sameValue => {
    let rows = baseQuery(db, model, query.filter, scope)
      .select(columns.map(field => sql`${columnRef(field)}`.as(field.name)))
      .select(extra)
      .select(sql`row_number() over (order by ${sql.join(order)})`.as(rankAlias))
      .where(sameValue)
    for (const term of order) rows = rows.orderBy(term)
    return rows.limit(query.limit)
  }).selectAll('r')
  return query.total === undefined ? built : built.limit(query.total)
}

/**
 * The rows of every value in one query, in `sort` order for each value, with `field` holding the value they belong to.
 * Given `values` are never read from the caller's input: they are the keys of records already read.
 */
export const relatedRows = async (db: Db, model: ResourceModel, query: RelatedRowsQuery, scope?: Scope, extra: Array<AliasedRawBuilder<unknown, string>> = []): Promise<Array<Record<string, unknown>>> => {
  const built = buildRelatedRows(db, model, query, scope, extra)
  if (query.values?.length === 0) return []
  const found = await built.execute() as Array<Record<string, unknown>>
  return found.map(({ [rankAlias]: _rank, ...row }) => row)
}
