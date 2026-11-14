import type { CheckedFilter, ResourceModel, SortSpec } from '@protobase/schema'
import { decodeCursor } from './cursor'
import { QueryError } from './errors'
import { maxLimit } from './list-query'
import type { RelatedPage, Scope } from './scope'
import { effectiveSort } from './sort'

/** What a `related()` term asks of its resource's read, as a list's `order_by`, `page_size` and `page_token` say it. */
export type RelatedPageRequest = { sort?: SortSpec; limit?: number; cursor?: string }

/**
 * The page a list of `model` with `filter` in `scope` would read for the same order, size and token, so a `related()`
 * term keeps to exactly the records that page shows: the limit is capped as a list's page size is, and the token only
 * continues the list it came from. A token needs a limit, as a page needs a size.
 */
export const relatedPage = (model: ResourceModel, request: RelatedPageRequest, filter?: CheckedFilter, scope?: Scope): RelatedPage => {
  const { sort, limit, cursor } = request
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new QueryError('invalid_limit', 'limit must be a positive integer')
  if (cursor !== undefined && limit === undefined) throw new QueryError('invalid_cursor', 'A page token needs the page size it was read with')
  const keys = effectiveSort(model, sort)
  return {
    ...(sort && { sort }),
    keys,
    ...(limit !== undefined && { limit: Math.min(limit, maxLimit) }),
    ...(cursor !== undefined && { after: decodeCursor(cursor, keys, filter, scope) }),
  }
}
