import type { ListQuery, ResourceModel } from '@protobase/schema'
import type { Db } from './db'
import { QueryError } from './errors'
import { assertFilterRequirements } from './filter-requirements'
import { clampLimit, extraSelections, type ListOptions, type ListResult } from './list-query'
import { relatedRows } from './related-rows'
import type { Scope } from './scope'

/** How many rows a list keeps per value of a field: `limit_per=<field>:<limit>`. */
export type LimitPer = { field: string; limit: number }

/**
 * A list that keeps, per value of `per.field` among the rows the filter finds, the first `per.limit` in the list's
 * order: by value, then in that order within each value, at most `query.limit` rows in all. It has no further page, so
 * it takes no cursor and answers none.
 */
export const listPerValue = async (db: Db, model: ResourceModel, query: ListQuery, per: LimitPer, scope?: Scope, options: ListOptions = {}): Promise<ListResult> => {
  if (query.cursor !== undefined) throw new QueryError('invalid_cursor', 'A page token cannot continue a list that keeps the first rows per value')
  const total = clampLimit(query.limit)
  await assertFilterRequirements(db, query.filter, scope)
  const rows = await relatedRows(db, model, {
    field: per.field,
    ...(query.filter && { filter: query.filter }),
    columns: query.columns ?? Object.keys(model.fields),
    ...(query.sort && { sort: query.sort }),
    limit: per.limit,
    total,
  }, scope, extraSelections(model, options.extraColumns))
  return { rows, nextCursor: null, prevCursor: null }
}
