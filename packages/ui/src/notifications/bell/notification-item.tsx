import type { MouseEvent } from 'react'
import type { InboxNotification } from '@protobase/client'
import { formatRelativeTime } from '../../format/date'
import { cn } from '../../lib/cn'
import { RouteLink } from '../../primitives/route-link'
import { toneDots } from '../../primitives/badge'
import type { NotificationTarget } from './notification-target'
import { text } from './messages'

export type NotificationItemProps = {
  item: InboxNotification
  /** Where its link goes, or none for a notification without a url. */
  target: NotificationTarget | undefined
  /** Follows a link to a page of the app in place. */
  onNavigate: (path: string) => void
  /** Called as the user opens it, by any click on its link. */
  onOpen: (item: InboxNotification) => void
  /** The time to tell how long ago it came from, in milliseconds. */
  now: number
}

const row = 'flex w-full gap-2.5 px-3 py-2.5 text-left'

/**
 * One notification of the panel: unread ones in bold beside a dot, its text, and how long ago it came. A notification
 * with a url is a link to it, followed in the app for the app's own pages and opened in a new tab for another site;
 * one without is not a link.
 */
export const NotificationItem = ({ item, target, onNavigate, onOpen, now }: NotificationItemProps) => {
  const unread = item.readAt === null
  const content = (
    <>
      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', unread ? toneDots.blue : 'bg-transparent')}>{unread && <span className="sr-only">{text('unread')}</span>}</span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-body text-foreground', unread && 'font-semibold')}>{item.title}</span>
        {item.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{item.body}</span>}
        <time dateTime={item.createdAt} className="mt-0.5 block text-xs text-faint-foreground">
          {formatRelativeTime((now - Date.parse(item.createdAt)) / 1000)}
        </time>
        {target?.kind === 'external' && <span className="sr-only">{text('opensNewTab')}</span>}
      </span>
    </>
  )
  const opened = () => onOpen(item)
  // A middle click opens it in a new tab too; a right click only shows the link's menu
  const middle = (event: MouseEvent) => {
    if (event.button === 1) opened()
  }
  if (!target) return <div className={row}>{content}</div>
  if (target.kind === 'app') {
    return (
      <RouteLink to={{ href: target.href, onFollow: () => onNavigate(target.path) }} onClick={opened} onAuxClick={middle} className={cn(row, 'hover:bg-muted')}>
        {content}
      </RouteLink>
    )
  }
  return (
    <a href={target.href} onClick={opened} onAuxClick={middle} className={cn(row, 'hover:bg-muted')} {...(target.kind === 'external' && { target: '_blank', rel: 'noopener' })}>
      {content}
    </a>
  )
}
