import { badRequest } from './problem'

const dayMs = 86_400_000

/** The day an instant falls on in `zone`, as YYYY-MM-DD; an unknown zone is a bad request. */
export const dayIn = (ms: number, zone: string) => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms)
  } catch (error) {
    if (error instanceof RangeError) throw badRequest('invalid-parameter', `Unknown time zone "${zone}"`, { errors: [{ parameter: 'time_zone', message: 'Unknown time zone' }] })
    throw error
  }
}

// A date has no time of its own: a range of dates runs over the viewer's days, so it starts on the viewer's day of
// `ms` and, as `to` is exclusive, ends the day after the viewer's today to keep today in.

/** Where a range starting at instant `ms` starts: that instant, or for a date the viewer's day of it. */
export const rangeStart = (type: string | undefined, ms: number, zone: string) =>
  type === 'date' ? dayIn(ms, zone) : new Date(ms).toISOString()

/** Where a range up to `now` ends, exclusive: that instant, or for a date the day after the viewer's today. */
export const rangeEnd = (type: string | undefined, now: number, zone: string) => {
  if (type !== 'date') return new Date(now).toISOString()
  return new Date(Date.parse(dayIn(now, zone)) + dayMs).toISOString().slice(0, 10)
}
