import type { CheckedFilter, ResourceModel, SortSpec } from '@protobase/schema'
import type { Db } from './db'
import { QueryError } from './errors'
import { listQuery, type ListOptions, type ListResult } from './list-query'
import type { Scope } from './scope'
import { scrollAnchors } from './scroll-anchors'

export type SeekRequest = {
  /** 0-based row position within the caller's visible rows, in `orderBy` order. */
  position: number
  orderBy: SortSpec
  filter?: CheckedFilter
  columns?: string[]
  limit?: number
}

const defaultLimit = 50

/**
 * Resolves a scroll position to a page of rows, server-side, with no OFFSET. Anchors are used internally only:
 * positions are scaled to the caller's scoped estimate, and the page is read with the full scope (tenant, row filter,
 * user filter), so it holds only visible rows. `options` (extra columns) pass through to the page read. The result carries page tokens for the visible rows, never anchor values.
 */
export const seekToPosition = async (db: Db, model: ResourceModel, request: SeekRequest, scope?: Scope, options: ListOptions = {}): Promise<ListResult> => {
  const [lead] = request.orderBy
  if (!lead) throw new QueryError('invalid_sort', 'orderBy needs at least one field')
  if (!Number.isInteger(request.position) || request.position < 0) {
    throw new QueryError('invalid_option', 'position must be a non-negative integer')
  }
  const anchors = await scrollAnchors(db, model, lead[0], {
    direction: lead[1],
    sort: request.orderBy,
    filter: request.filter,
    scope,
  })
  const cursor = await anchors.seekToPosition(request.position)
  return listQuery(db, model, {
    limit: request.limit ?? defaultLimit,
    sort: request.orderBy,
    filter: request.filter,
    columns: request.columns,
    cursor,
  }, scope, options)
}
