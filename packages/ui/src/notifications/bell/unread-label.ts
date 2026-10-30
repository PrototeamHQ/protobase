import { text } from './messages'

// The history counts up to 100: more than 99 shows as 99+, as the count over the bell does
const shownMax = 99

/** The bell's name for a screen reader, with how many are unread. */
export const bellLabel = (count: number | undefined) => {
  if (count === undefined || count <= 0) return text('notifications')
  return count > shownMax ? text('notificationsManyUnread') : text('notificationsUnread', { count: String(count) })
}
