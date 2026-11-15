import { useEffect, useState } from 'react'
import type { ResourceModel } from '@protobase/schema'
import { useList } from '../../data/use-list'
import type { LayoutList } from './layout-list'
import type { Planned } from './plan-reads'
import { relatedListOf } from './related-list-of'

type Request = {
  model: ResourceModel
  /** `undefined` when no record can match, such as when the record around it holds no value to tie the list by. */
  filter: string | undefined
  sort: string
  perPage: number
  /** Whether a button reads the next `perPage` records into the same list. */
  more: boolean
  /** The rows the page's planned read holds for it, which it draws instead of reading them itself. */
  planned?: Planned
}

/**
 * The first `perPage` records of `model` a list block reads, from the page's planned read or a read of its own, and
 * with `more` each next page added to the same list. Nothing is read when no record can match. A planned list's next
 * pages are a read of the list's own, from its first page, the planned rows staying on screen meanwhile.
 */
export const useRelatedList = ({ model, filter, sort, perPage, more, planned }: Request): { read: { isPending: boolean; error: Error | null }; list: LayoutList } => {
  const [expanded, setExpanded] = useState(false)
  const query = useList(model.name, { filter, orderBy: sort, pageSize: perPage, enabled: filter !== undefined && (!planned || expanded) })
  const pages = query.data?.pages.length ?? 0
  const { hasNextPage, isFetchingNextPage, fetchNextPage, error } = query
  // The first click on a planned list reads its first page and then the one after it
  useEffect(() => {
    if (planned && expanded && !error && pages === 1 && hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [planned, expanded, error, pages, hasNextPage, isFetchingNextPage, fetchNextPage])
  const own = { pages, items: query.items, hasNextPage, isFetchingNextPage, isPending: query.isPending, error, fetchNextPage }
  return relatedListOf({ model, filter, perPage, more, planned, expanded, expand: () => setExpanded(true), own })
}
