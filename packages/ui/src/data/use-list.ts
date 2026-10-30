import { useInfiniteQuery, type InfiniteData, type QueryKey, type UseInfiniteQueryOptions } from '@tanstack/react-query'
import { filterText, type FilterInput, type ListPage } from '@protobase/client'
import { useClient } from './api-provider'
import { keys } from './query-keys'

export type UseListParams = {
  filter?: FilterInput
  orderBy?: string
  pageSize?: number
  fields?: string[]
  /** Names the records relations point at, as `client.list`'s `labels`: `{ product_id: 'name' }`. */
  labels?: Record<string, string>
  /** Start at this page token instead of the first page, for example one from `useAnchors`. */
  startToken?: string
  enabled?: boolean
  /** TanStack Query's `refetchInterval`: refetch every so many milliseconds, `false` to stop, or a function of the query. */
  refetchInterval?: UseInfiniteQueryOptions<ListPage<Row>, Error, InfiniteData<ListPage<Row>>, QueryKey, string>['refetchInterval']
}

type Row = Record<string, unknown>

/** Infinite pages of a resource, following `next_page_token`. */
export const useList = (resource: string, { filter, orderBy, pageSize = 50, fields, labels, startToken = '', enabled = true, refetchInterval }: UseListParams = {}) => {
  const client = useClient()
  const text = filterText(filter) ?? ''
  const query = useInfiniteQuery({
    queryKey: [...keys.list(resource, text, orderBy ?? '', pageSize, startToken), fields?.join(',') ?? '', ...(labels ? [labels] : [])],
    enabled,
    refetchInterval,
    initialPageParam: startToken,
    queryFn: ({ pageParam }): Promise<ListPage<Row>> => client.list(resource, { filter: text, orderBy, pageSize, fields, labels, pageToken: pageParam }),
    getNextPageParam: (last) => last.nextPageToken || undefined,
  })
  const pages = query.data?.pages ?? []
  return {
    ...query,
    items: pages.flatMap((page) => page.items),
    totalEstimate: pages[0]?.totalSizeEstimate,
    /** Per relation asked for in `labels`, the names of the records it points at, from every page loaded. */
    labels: Object.fromEntries(Object.keys(labels ?? {}).map((name) => [name, Object.assign({}, ...pages.map((page) => page.labels?.[name] ?? {})) as Record<string, string>])),
  }
}
