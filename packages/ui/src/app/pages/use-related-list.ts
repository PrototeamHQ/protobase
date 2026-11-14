import type { ResourceModel } from '@protobase/schema'
import { useList } from '../../data/use-list'
import type { LayoutList } from './layout-list'

type Request = {
  model: ResourceModel
  /** `undefined` when no record can match, such as when the record around it holds no value to tie the list by. */
  filter: string | undefined
  sort: string
  perPage: number
  /** Whether a button reads the next `perPage` records into the same list. */
  more: boolean
}

/**
 * The first `perPage` records of `model` a list block reads, one read of its own, and with `more` each next page added
 * to the same list. Nothing is read when no record can match.
 */
export const useRelatedList = ({ model, filter, sort, perPage, more }: Request): { read: { isPending: boolean; error: Error | null }; list: LayoutList } => {
  const query = useList(model.name, { filter, orderBy: sort, pageSize: perPage, enabled: filter !== undefined })
  if (filter === undefined) return { read: { isPending: false, error: null }, list: { model, items: [] } }
  const loadMore = more && query.hasNextPage ? () => void query.fetchNextPage() : undefined
  return { read: { isPending: query.isPending, error: query.error }, list: { model, items: query.items, ...(loadMore && { loadMore, loadingMore: query.isFetchingNextPage }) } }
}
