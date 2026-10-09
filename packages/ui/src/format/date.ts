const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const dayShort = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })

export const formatDate = (ms: number) => day.format(ms)

export const formatDayShort = (ms: number) => dayShort.format(ms)

export const formatDateTime = (ms: number) => `${day.format(ms)}, ${time.format(ms)}`

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

/** "5 minutes ago", "yesterday", "3 years ago"; `seconds` is how long ago it was. */
export const formatRelativeTime = (seconds: number) => {
  const [unit, size] = units.find(([, size]) => seconds >= size) ?? ['second', 1]
  if (unit === 'second' && seconds < 45) return 'just now'
  return relative.format(-Math.floor(seconds / size), unit)
}
