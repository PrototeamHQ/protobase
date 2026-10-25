import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { isApiError, type InboxNotification, type InboxPage } from '@protobase/client'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'

// How often the unread count is read again while the page is visible; a hidden tab reads it again when it shows.
const unreadRefreshMs = 30_000

/** Whether the app keeps the history from the user, as from a session its own sign-in does not mark as theirs. */
export const historyRefused = (error: unknown) => isApiError(error) && error.status === 403

/**
 * How many of the signed-in user's notifications are unread, at most 100 (show `99+` from there): read on load, every
 * half minute while the page is visible, on a return to it, and after the user opens or marks one read. It stops
 * reading once the app refuses the user their history (`historyRefused`).
 */
export const useUnreadNotifications = ({ enabled = true }: { enabled?: boolean } = {}) => {
  const client = useClient()
  return useQuery({ queryKey: keys.inboxUnread, queryFn: () => client.notifications.unread(), refetchInterval: (query) => (historyRefused(query.state.error) ? false : unreadRefreshMs), enabled })
}

/**
 * The signed-in user's notifications, newest first, a page at a time: `items` those loaded so far, `fetchNextPage`
 * the next page while `hasNextPage`. Read only while `enabled`, such as while the panel is open.
 */
export const useInbox = ({ enabled = true }: { enabled?: boolean } = {}) => {
  const client = useClient()
  const query = useInfiniteQuery({
    queryKey: keys.inboxPages,
    queryFn: ({ pageParam }) => client.notifications.list(pageParam === '' ? {} : { cursor: pageParam }),
    initialPageParam: '',
    getNextPageParam: (page: InboxPage) => page.next ?? undefined,
    enabled,
  })
  const items = query.data?.pages.flatMap((page) => page.items) ?? []
  return { ...query, items }
}

// The loaded pages and the count as they are once `read` is read, before the server answers.
const showRead = (queryClient: QueryClient, read: (item: InboxNotification) => boolean) => {
  const now = new Date().toISOString()
  let marked = 0
  queryClient.setQueryData<InfiniteData<InboxPage>>(keys.inboxPages, (data) =>
    data && {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.map((item) => {
          if (item.readAt !== null || !read(item)) return item
          marked += 1
          return { ...item, readAt: now }
        }),
      })),
    },
  )
  queryClient.setQueryData<number>(keys.inboxUnread, (count) => (count === undefined ? count : Math.max(0, count - marked)))
}

/**
 * Marks notifications read: `markRead(item)` one, as opening it does, and `markAllRead(newest)` all of them up to the
 * newest one the user was shown, so one that arrives meanwhile stays unread. The panel and the count show it at once,
 * and are read again once the server has it.
 */
export const useMarkNotificationsRead = () => {
  const client = useClient()
  const queryClient = useQueryClient()
  const settled = () => queryClient.invalidateQueries({ queryKey: keys.inbox })
  const one = useMutation({
    mutationFn: (item: InboxNotification) => client.notifications.markRead(item.id),
    onMutate: (item) => showRead(queryClient, (shown) => shown.id === item.id),
    onSettled: settled,
  })
  const all = useMutation({
    mutationFn: (newest: InboxNotification) => client.notifications.markAllRead(newest.createdAt),
    onMutate: (newest) => showRead(queryClient, (shown) => shown.createdAt <= newest.createdAt),
    onSettled: settled,
  })
  const markOne = one.mutate
  const markRead = useCallback(
    (item: InboxNotification) => {
      if (item.readAt === null) markOne(item)
    },
    [markOne],
  )
  const markAllRead = all.mutate
  return { markRead, markAllRead, markingAll: all.isPending }
}
