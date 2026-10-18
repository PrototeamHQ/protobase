import { useInfiniteQuery } from '@tanstack/react-query'
import type { CommentPage } from '@protobase/client'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'

const pageSize = 20

/** A record's comments, oldest first: the newest page, then each earlier one `fetchNextPage` loads, at the top. */
export const useRecordComments = (resource: string, recordKey: string) => {
  const client = useClient()
  const query = useInfiniteQuery({
    queryKey: keys.comments(resource, recordKey),
    initialPageParam: '',
    queryFn: ({ pageParam }): Promise<CommentPage> => client.comments(resource, recordKey, { pageSize, pageToken: pageParam }),
    getNextPageParam: (last) => last.nextPageToken || undefined,
  })
  return { ...query, items: query.data?.pages.flatMap((page) => page.items).reverse() ?? [] }
}
