import { Bell } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CountBadge } from '../../primitives/count-badge'
import { Button } from '../../primitives/button'
import { usePopoverMenu } from '../../primitives/popover-menu'
import { useRouter } from '../../app/router'
import { usePushNotifications } from '../push/use-push-notifications'
import { NotificationPanel } from './notification-panel'
import { notificationTarget } from './notification-target'
import { PushControl } from './push-control'
import { historyRefused, useInbox, useMarkNotificationsRead, useUnreadNotifications } from './use-inbox'
import { bellLabel } from './unread-label'

/**
 * The top bar's bell: how many of the signed-in user's notifications are unread, and the panel it opens, their inbox,
 * which ends with push for this device. The panel loads its notifications when it opens; opening one closes it.
 */
export const NotificationBell = () => {
  const { open, setOpen, place, button, menu } = usePopoverMenu<HTMLDivElement>()
  const unread = useUnreadNotifications()
  const inbox = useInbox({ enabled: open })
  const { markRead, markAllRead, markingAll } = useMarkNotificationsRead()
  const push = usePushNotifications()
  const { navigate, basePath } = useRouter()
  const [now, setNow] = useState(Date.now)
  const label = bellLabel(unread.data)
  const origin = window.location.origin
  // An app whose own sign-in does not mark the user's own sessions keeps the history from them: no bell then
  if (historyRefused(unread.error)) return null

  const toggle = () => {
    // Opening reads the count and the newest notifications again, and tells how long ago they came from now
    if (!open) {
      setNow(Date.now())
      void unread.refetch()
      if (inbox.data) void inbox.refetch()
    }
    setOpen(!open)
  }

  return (
    <>
      <Button ref={button} size="icon" variant="ghost" aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open} onClick={toggle} className="relative max-md:size-9">
        <Bell className="size-4 max-md:size-5" />
        <CountBadge count={unread.data} className="pointer-events-none absolute -top-1 -right-1.5 max-md:top-0 max-md:right-0" />
      </Button>
      {open &&
        createPortal(
          <div ref={menu} role="dialog" aria-label={bellLabel(undefined)} style={place ?? { visibility: 'hidden' }} className="fixed z-50 w-[min(22rem,calc(100%-0.5rem))] rounded-md border bg-background shadow-pop">
            <NotificationPanel
              items={inbox.items}
              loading={inbox.isPending}
              failed={inbox.isError}
              onRetry={() => void inbox.refetch()}
              hasMore={inbox.hasNextPage}
              loadingMore={inbox.isFetchingNextPage}
              onMore={() => void inbox.fetchNextPage()}
              onMarkAllRead={markAllRead}
              markingAll={markingAll}
              targetOf={(item) => notificationTarget(item.url, { origin, basePath })}
              onNavigate={(path) => navigate(path)}
              onOpen={(item) => {
                markRead(item)
                setOpen(false)
              }}
              footer={<PushControl state={push.state} onTurnOn={() => void push.turnOn()} onTurnOff={() => void push.turnOff()} />}
              now={now}
            />
          </div>,
          document.body,
        )}
    </>
  )
}
