import { useEffect, useState } from 'react'
import { useList, type UseListParams } from '../../data/use-list'
import type { Planned } from '../pages/planned'
import { threadListOf } from './planned-thread-list'

/**
 * One list of a thread, its messages or its tool calls: from the page's planned read when it has one, earlier records
 * read by itself on request, and otherwise read by itself; nothing is read while not `enabled`.
 */
export const useThreadList = (resource: string, { pageSize = 50, enabled = true, ...request }: UseListParams, planned: Planned | undefined) => {
  const [expanded, setExpanded] = useState(false)
  const list = useList(resource, { ...request, pageSize, enabled: enabled && (!planned || expanded) })
  const pages = list.data?.pages.length ?? 0
  const { hasNextPage, isFetchingNextPage, fetchNextPage, error } = list
  // Asking a planned thread for earlier records reads its first page and then the one after it
  useEffect(() => {
    if (planned && expanded && !error && pages === 1 && hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [planned, expanded, error, pages, hasNextPage, isFetchingNextPage, fetchNextPage])
  return threadListOf({ planned, limit: pageSize, expanded, expand: () => setExpanded(true), own: { ...list, pages } })
}
