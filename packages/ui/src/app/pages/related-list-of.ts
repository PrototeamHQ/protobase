import type { ResourceModel } from '@protobase/schema'
import type { LayoutList } from './layout-list'
import type { Planned } from './planned'

/** Where a list's own read stands: the pages it read so far, their records, and whether one more is there. */
export type OwnRead = {
  pages: number
  items: Record<string, unknown>[]
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isPending: boolean
  error: Error | null
  fetchNextPage: () => unknown
}

type State = {
  model: ResourceModel
  /** `undefined` when no record can match. */
  filter: string | undefined
  perPage: number
  more: boolean
  planned: Planned | undefined
  /** Whether a planned list's button was clicked, so it reads its pages itself from then on. */
  expanded: boolean
  expand: () => void
  own: OwnRead
}

/** The list a list block draws and the read it shows the state of, from its planned rows or its own read. */
export const relatedListOf = ({ model, filter, perPage, more, planned, expanded, expand, own }: State): { read: { isPending: boolean; error: Error | null }; list: LayoutList } => {
  if (filter === undefined) return { read: { isPending: false, error: null }, list: { model, items: [] } }
  if (planned && !expanded) {
    const items = planned.rows.slice(0, perPage)
    const loadMore = more && items.length === perPage ? expand : undefined
    return { read: planned, list: { model, items, planned: true, ...(loadMore && { loadMore }) } }
  }
  // While a planned list reads its first two pages, its planned rows stay, still planned, the button loading
  if (planned && !own.error && own.pages < 2 && (own.pages === 0 || own.hasNextPage)) {
    return { read: planned, list: { model, items: planned.rows.slice(0, perPage), planned: true, loadMore: () => {}, loadingMore: true } }
  }
  // The rows the list read itself are its own, so the reads planned inside them no longer hold theirs
  const loadMore = more && own.hasNextPage ? () => void own.fetchNextPage() : undefined
  return { read: { isPending: own.isPending, error: own.error }, list: { model, items: own.items, ...(loadMore && { loadMore, loadingMore: own.isFetchingNextPage }) } }
}
