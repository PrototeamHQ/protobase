// How long ago a moment was in words, as the web's relative time reads: the largest unit it spans, "now" under 45 seconds.

const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['day', 86_400],
  ['hour', 3600],
  ['minute', 60],
]

/** "5 minutes ago", "yesterday", "in 3 hours"; `seconds` is how long ago it was, negative for a time to come. */
export const relativeTimeText = (seconds: number, locale?: string) => {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const away = Math.abs(seconds)
  const [unit, size] = units.find(([, size]) => away >= size) ?? ['second', 1]
  if (unit === 'second' && away < 45) return format.format(0, 'second')
  return format.format(-Math.sign(seconds) * Math.floor(away / size), unit)
}
