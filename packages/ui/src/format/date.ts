import { viewerZone } from './zone'

// Dates, months and weekdays are zone-free days, kept in UTC; times are the viewer's, in `zone`.
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const dayShort = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const month = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' })
const weekdayDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export const formatDate = (ms: number) => day.format(ms)

export const formatDayShort = (ms: number) => dayShort.format(ms)

const zoned = new Map<string, { day: Intl.DateTimeFormat; time: Intl.DateTimeFormat }>()

const zonedFormats = (zone: string) => {
  const known = zoned.get(zone)
  if (known) return known
  const formats = {
    day: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: zone }),
    time: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone }),
  }
  zoned.set(zone, formats)
  return formats
}

/** "6 Oct 2026, 16:32": an instant on the clock of `zone`, the viewer's unless given. */
export const formatDateTime = (ms: number, zone = viewerZone()) => {
  const formats = zonedFormats(zone)
  return `${formats.day.format(ms)}, ${formats.time.format(ms)}`
}

/** "October 2026". */
export const formatMonth = (ms: number) => month.format(ms)

/** "Mon". */
export const formatWeekday = (ms: number) => weekday.format(ms)

/** "Monday, 12 Oct 2026". */
export const formatWeekdayDate = (ms: number) => weekdayDate.format(ms)

/** "12–18 Oct 2026", "28 Dec 2026 – 3 Jan 2027": the days from `from` to `to`, both included. */
export const formatDayRange = (from: number, to: number) => day.formatRange(from, to)

/** "09:30": an instant's time on the clock of `zone`, the viewer's unless given. */
export const formatTime = (ms: number, zone = viewerZone()) => zonedFormats(zone).time.format(ms)

export const formatAgo = (seconds: number) => {
  if (seconds < 60) return `${seconds} s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`
  return `${Math.floor(seconds / 86_400)} d ago`
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

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
  if (unit === 'second' && away < 45) return 'just now'
  return relative.format(-Math.sign(seconds) * Math.floor(away / size), unit)
}
