import { sql, type SqlBool } from 'kysely'
import type { KeyValue, ResourceModel, SortSpec } from '@protobase/schema'
import { baseQuery } from './base-query'
import { columnRef, findField } from './columns'
import type { Db } from './db'
import { QueryError } from './errors'
import { maxLimit } from './list-query'
import { orderTerm } from './order'
import type { Scope } from './scope'
import { effectiveSort } from './sort'

/** The rows of `model` whose `field` holds one of `values`, at most `limit` for each value, in `sort` order. */
export type RelatedRowsQuery = {
  /** The field that points at the records the rows belong to, such as a photo's `listing_id`. */
  field: string
  /** The keys of those records. */
  values: readonly KeyValue[]
  /** The fields it reads, by name; `field` is always among them. */
  columns: string[]
  /** The order within each value; the primary key decides ties. */
  sort?: SortSpec
  limit: number
}

const ownerAlias = '__pb_owner'
const rankAlias = '__pb_rank'

/**
 * The query `relatedRows` runs: the values that have rows, each joined to its first `limit` rows by a lateral subquery,
 * so an index on `field` and the sort reads only those rows. Both sides stay inside the scope.
 */
export const buildRelatedRows = (db: Db, model: ResourceModel, query: RelatedRowsQuery, scope?: Scope) => {
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > maxLimit) throw new QueryError('invalid_limit', `limit must be a whole number from 1 to ${maxLimit}`)
  const owner = findField(model, query.field)
  const columns = [...new Set([query.field, ...query.columns])].map(name => findField(model, name))
  const order = effectiveSort(model, query.sort).map(key => orderTerm(key))

  const owners = baseQuery(db, model, undefined, scope)
    .select(sql`${columnRef(owner)}`.as(ownerAlias))
    .distinct()
    .where(sql<SqlBool>`${columnRef(owner)} in (${sql.join(query.values)})`)
  let rows = baseQuery(db, model, undefined, scope)
    .select(columns.map(field => sql`${columnRef(field)}`.as(field.name)))
    .select(sql`row_number() over (order by ${sql.join(order)})`.as(rankAlias))
    .where(sql<SqlBool>`${columnRef(owner)} = ${sql.ref(`k.${ownerAlias}`)}`)
  for (const term of order) rows = rows.orderBy(term)
  return db
    .selectFrom(owners.as('k'))
    .innerJoinLateral(rows.limit(query.limit).as('r'), join => join.onTrue())
    .selectAll('r')
    .orderBy(sql.ref(`r.${rankAlias}`))
}

/**
 * The rows of every value in one query, in `sort` order for each value, with `field` holding the value they belong to.
 * The values themselves are never read from the caller's input: they are the keys of records already read.
 */
export const relatedRows = async (db: Db, model: ResourceModel, query: RelatedRowsQuery, scope?: Scope): Promise<Array<Record<string, unknown>>> => {
  const built = buildRelatedRows(db, model, query, scope)
  if (query.values.length === 0) return []
  const found = await built.execute() as Array<Record<string, unknown>>
  return found.map(({ [rankAlias]: _rank, ...row }) => row)
}
