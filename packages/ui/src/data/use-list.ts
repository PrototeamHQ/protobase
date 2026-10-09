import { useInfiniteQuery } from '@tanstack/react-query'
import { filterText, type FilterInput, type ListPage } from '@protobase/client'
import { useClient } from './api-provider'
import { keys } from './query-keys'

export type UseListParams = {
  filter?: FilterInput
  orderBy?: string
  pageSize?: number
  fields?: string[]
  /** Start at this page token instead of the first page, for example one from `useAnchors`. */
  startToken?: string
  enabled?: boolean
}

type Row = Record<string, unknown>

/** Infinite pages of a resource, following `next_page_token`. */
export const useList = (resource: string, { filter, orderBy, pageSize = 50, fields, startToken = '', enabled = true }: UseListParams = {}) => {
  const client = useClient()
  const text = filterText(filter) ?? ''
  const query = useInfiniteQuery({
    queryKey: [...keys.list(resource, text, orderBy ?? '', pageSize, startToken), fields?.join(',') ?? ''],
    enabled,
    initialPageParam: startToken,
    queryFn: ({ pageParam }): Promise<ListPage<Row>> => client.list(resource, { filter: text, orderBy, pageSize, fields, pageToken: pageParam }),
    getNextPageParam: (last) => last.nextPageToken || undefined,
  })
  const pages = query.data?.pages ?? []
  return {
    ...query,
    items: pages.flatMap((page) => page.items),
    totalEstimate: pages[0]?.totalSizeEstimate,
  }
}
