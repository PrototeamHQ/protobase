import { cachedFormat } from './intl-cache'
import { text } from './messages'
import { viewerZone } from './zone'

// Dates, months and weekdays are zone-free days, kept in UTC; times are the viewer's, in `zone`.
const dateFormat = (name: string, options: Intl.DateTimeFormatOptions) => () => cachedFormat(`date:${name}`, (tag) => new Intl.DateTimeFormat(tag, { ...options, timeZone: 'UTC' }))
const day = dateFormat('day', { day: 'numeric', month: 'short', year: 'numeric' })
const dayShort = dateFormat('dayShort', { day: 'numeric', month: 'short' })
const month = dateFormat('month', { month: 'long', year: 'numeric' })
const weekday = dateFormat('weekday', { weekday: 'short' })
const weekdayDate = dateFormat('weekdayDate', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })

export const formatDate = (ms: number) => day().format(ms)

export const formatDayShort = (ms: number) => dayShort().format(ms)

const zonedFormats = (zone: string) =>
  cachedFormat(`zoned:${zone}`, (tag) => ({
    day: new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', year: 'numeric', timeZone: zone }),
    time: new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone }),
  }))

/** "6 Oct 2026, 16:32": an instant on the clock of `zone`, the viewer's unless given. */
export const formatDateTime = (ms: number, zone = viewerZone()) => {
  const formats = zonedFormats(zone)
  return `${formats.day.format(ms)}, ${formats.time.format(ms)}`
}

/** "October 2026". */
export const formatMonth = (ms: number) => month().format(ms)

/** "Mon". */
export const formatWeekday = (ms: number) => weekday().format(ms)

/** "Monday, 12 Oct 2026". */
export const formatWeekdayDate = (ms: number) => weekdayDate().format(ms)

/** "12–18 Oct 2026", "28 Dec 2026 – 3 Jan 2027": the days from `from` to `to`, both included. */
export const formatDayRange = (from: number, to: number) => day().formatRange(from, to)

/** "09:30": an instant's time on the clock of `zone`, the viewer's unless given. */
export const formatTime = (ms: number, zone = viewerZone()) => zonedFormats(zone).time.format(ms)

export const formatAgo = (seconds: number) => {
  if (seconds < 60) return text('secondsAgo', seconds)
  if (seconds < 3600) return text('minutesAgo', Math.floor(seconds / 60))
  if (seconds < 86_400) return text('hoursAgo', Math.floor(seconds / 3600))
  return text('daysAgo', Math.floor(seconds / 86_400))
}

const relative = () => cachedFormat('relative', (tag) => new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }))

const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['day', 86_400],
  ['hour', 3600],
  ['minute', 60],
]

/** "5 minutes ago", "yesterday", "in 3 hours"; `seconds` is how long ago it was, negative for a time to come. */
export const formatRelativeTime = (seconds: number) => {
  const away = Math.abs(seconds)
  const [unit, size] = units.find(([, size]) => away >= size) ?? ['second', 1]
  if (unit === 'second' && away < 45) return text('justNow')
  return relative().format(-Math.sign(seconds) * Math.floor(away / size), unit)
}
