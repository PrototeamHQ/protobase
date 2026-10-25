import { text } from './messages'

// The history counts up to 100: more than 99 shows as 99+
const shownMax = 99

/** The count over the bell, or none while nothing is unread. */
export const unreadBadge = (count: number | undefined) => (count === undefined || count <= 0 ? undefined : count > shownMax ? `${shownMax}+` : String(count))

/** The bell's name for a screen reader, with how many are unread. */
export const bellLabel = (count: number | undefined) => {
  if (count === undefined || count <= 0) return text('notifications')
  return count > shownMax ? text('notificationsManyUnread') : text('notificationsUnread', String(count))
}
