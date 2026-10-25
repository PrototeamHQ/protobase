import type { ReactNode } from 'react'
import type { InboxNotification } from '@protobase/client'
import { Button } from '../../primitives/button'
import { Spinner } from '../../primitives/spinner'
import { NotificationItem } from './notification-item'
import type { NotificationTarget } from './notification-target'
import { text } from './messages'

export type NotificationPanelProps = {
  items: InboxNotification[]
  /** The first page is loading. */
  loading: boolean
  /** The first page could not be loaded; `onRetry` reads it again. */
  failed: boolean
  onRetry: () => void
  /** There are older notifications to load, with `onMore`; `loadingMore` while they load. */
  hasMore: boolean
  loadingMore: boolean
  onMore: () => void
  /** Marks all read up to the newest one shown; offered while one of them is unread. */
  onMarkAllRead: (newest: InboxNotification) => void
  markingAll: boolean
  targetOf: (item: InboxNotification) => NotificationTarget | undefined
  onNavigate: (path: string) => void
  onOpen: (item: InboxNotification) => void
  /** What the panel ends with, such as the push control. */
  footer?: ReactNode
  now: number
}

/**
 * The bell's panel, the user's inbox: a heading with "Mark all as read", the newest notifications first, "Show more"
 * for older ones, and the footer. The list scrolls inside the panel: the panel is fixed to the viewport under the bell,
 * so the page cannot scroll it.
 */
export const NotificationPanel = ({ items, loading, failed, onRetry, hasMore, loadingMore, onMore, onMarkAllRead, markingAll, targetOf, onNavigate, onOpen, footer, now }: NotificationPanelProps) => {
  const newest = items[0]
  const unread = items.some((item) => item.readAt === null)
  return (
    <div className="flex max-h-[min(32rem,calc(100dvh-var(--pb-sticky-top,3rem)-1rem))] flex-col">
      <div className="flex min-h-11 items-center gap-2 border-b px-3">
        <h2 className="flex-1 text-body font-semibold">{text('notifications')}</h2>
        {newest && unread && (
          <Button size="sm" variant="ghost" loading={markingAll} onClick={() => onMarkAllRead(newest)}>
            {text('markAllRead')}
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner className="size-4" />
          </div>
        ) : failed ? (
          <div className="flex flex-col items-center gap-2 px-3 py-6 text-center text-body text-muted-foreground">
            <p>{text('loadFailed')}</p>
            <Button size="sm" onClick={onRetry}>
              {text('tryAgain')}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <p className="px-3 py-8 text-center text-body text-muted-foreground">{text('empty')}</p>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item.id}>
                <NotificationItem item={item} target={targetOf(item)} onNavigate={onNavigate} onOpen={onOpen} now={now} />
              </li>
            ))}
          </ul>
        )}
        {hasMore && !loading && !failed && (
          <div className="flex justify-center border-t py-2">
            <Button size="sm" variant="ghost" loading={loadingMore} onClick={onMore}>
              {text('showMore')}
            </Button>
          </div>
        )}
      </div>
      {footer}
    </div>
  )
}
