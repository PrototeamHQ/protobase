import { useEffect } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import type { HistoryPage } from '@protobase/client'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'

/** How long after a save the history looks again: the server keeps a change just after its write commits. */
const afterSave = 1500

/**
 * A record's changes, newest first, `pageSize` at a time. Its key starts with the record's, so refreshing the record
 * refreshes it too; it looks again shortly after `etag` changes, once the server has kept the save.
 */
export const useRecordHistory = (resource: string, recordKey: string, pageSize: number, etag: string) => {
  const client = useClient()
  const query = useInfiniteQuery({
    queryKey: keys.history(resource, recordKey, pageSize),
    initialPageParam: '',
    queryFn: ({ pageParam }): Promise<HistoryPage> => client.history(resource, recordKey, { pageSize, pageToken: pageParam }),
    getNextPageParam: (last) => last.nextPageToken || undefined,
  })
  const { refetch } = query
  useEffect(() => {
    const timer = setTimeout(() => void refetch(), afterSave)
    return () => clearTimeout(timer)
  }, [etag, refetch])
  return { ...query, items: query.data?.pages.flatMap((page) => page.items) ?? [] }
}
