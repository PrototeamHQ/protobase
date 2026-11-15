import { useEffect, useState } from 'react'
import type { ResourceModel } from '@protobase/schema'
import { useList } from '../../data/use-list'
import type { LayoutList } from './layout-list'
import type { Planned } from './plan-reads'

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
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  // The first click on a planned list reads its first page and then the one after it
  useEffect(() => {
    if (planned && expanded && pages === 1 && hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [planned, expanded, pages, hasNextPage, isFetchingNextPage, fetchNextPage])
  if (filter === undefined) return { read: { isPending: false, error: null }, list: { model, items: [] } }
  if (planned && !expanded) {
    const items = planned.rows.slice(0, perPage)
    const loadMore = more && items.length === perPage ? () => setExpanded(true) : undefined
    return { read: planned, list: { model, items, ...(loadMore && { loadMore }) } }
  }
  // While a planned list reads its first two pages, its planned rows stay, the button loading
  if (planned && !query.error && pages < 2 && (pages === 0 || hasNextPage)) return { read: planned, list: { model, items: planned.rows.slice(0, perPage), loadMore: () => {}, loadingMore: true } }
  const loadMore = more && query.hasNextPage ? () => void query.fetchNextPage() : undefined
  return { read: { isPending: query.isPending, error: query.error }, list: { model, items: query.items, ...(loadMore && { loadMore, loadingMore: query.isFetchingNextPage }) } }
}
