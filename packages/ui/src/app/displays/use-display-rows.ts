import { useInfiniteQuery } from '@tanstack/react-query'
import type { ResourceModel } from '@protobase/schema'
import { gridPageSize } from '../../data-grid'
import type { LoadedPage } from '../../live/grid-loader'
import type { ListDisplay } from './display-context'
import { displayRow } from './list-displays'

/**
 * The list page's rows page by page, for a display other than the table: the same loader and pages as the table, so
 * switching between them reads no row twice.
 */
export const useDisplayRows = (model: ResourceModel, page: (number: number) => Promise<LoadedPage>, key: readonly unknown[], enabled: boolean): ListDisplay => {
  const query = useInfiniteQuery({
    queryKey: [...key, 'display'],
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => page(pageParam),
    getNextPageParam: (last, pages) => (last.rows.length === gridPageSize && pages.length * gridPageSize < (pages[0]?.total ?? 0) ? pages.length : undefined),
  })
  const pages = query.data?.pages ?? []
  return {
    resource: model.name,
    rows: pages.flatMap((loaded) => loaded.rows.map((row) => displayRow(model, row))),
    total: pages[0]?.total ?? 0,
    loading: query.isPending,
    error: query.error,
    more: query.hasNextPage,
    loadMore: () => void query.fetchNextPage(),
  }
}
