import { formatWeekdayDate } from '../format/date'
import { dayIn, viewerZone } from '../format/zone'
import { text } from './messages'

const dayBefore = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)

/** Whether two ISO timestamps fall on the same day in `zone`, the viewer's unless given: a day divider goes between two messages that do not. */
export const sameChatDay = (a: string, b: string, zone = viewerZone()) => dayIn(Date.parse(a), zone) === dayIn(Date.parse(b), zone)

/** The label of the divider above a day's first message, sent at `time`: "Today", "Yesterday" or "Mon, 26 Oct 2026", as the viewer's calendar in `zone` has it. */
export const chatDayLabel = (time: string, now = Date.now(), zone = viewerZone()) => {
  const day = dayIn(Date.parse(time), zone)
  const today = dayIn(now, zone)
  if (day === today) return text('today')
  if (day === dayBefore(today)) return text('yesterday')
  return formatWeekdayDate(Date.parse(`${day}T00:00:00Z`))
}
