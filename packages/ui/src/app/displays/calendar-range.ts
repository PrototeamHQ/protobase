import type { CalendarView, FilterValue, ListDisplayModel, ResourceModel } from '@protobase/schema'
import { printFilter, where } from '@protobase/schema'
import { dayIn, instantAt, startOfDayIn, viewerZone, zoneOffset } from '../../format/zone'
import type { ListDisplayRow } from './list-displays'

// The days a calendar shows and the records on them, as `YYYY-MM-DD` days, weeks from Monday. A date is on its own day;
// a timestamp, and today, on the viewer's day, in `zone`.

export type CalendarDisplayModel = Extract<ListDisplayModel, { kind: 'calendar' }>

/** A display that places records on days by their `start` and `end`, with a `title` on each: a calendar, or a timeline. */
export type DatedDisplay = Pick<CalendarDisplayModel, 'start' | 'end' | 'title'>

/** The days a calendar shows, as the half-open interval from the first day to the day after the last. */
export type CalendarRange = { from: string; to: string }

const dayMs = 86_400_000

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const startOf = (day: string) => Date.parse(`${day}T00:00:00Z`)

/** The day `count` days after `day`, or before it for a negative count. */
export const addDays = (day: string, count: number) => dayOf(startOf(day) + count * dayMs)

/** The Monday on or before `day`. */
export const monday = (day: string) => addDays(day, -((new Date(startOf(day)).getUTCDay() + 6) % 7))

/** The 1st of the month of `day`, or of the month `step` months on. */
export const monthOf = (day: string, step = 0) => {
  const date = new Date(startOf(day))
  return dayOf(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + step, 1))
}

const normalised = ({ scale, day }: CalendarView): CalendarView => ({ scale, day: scale === 'month' ? monthOf(day) : monday(day) })

/** The month or week a calendar shows: the address's, starting on the month's 1st or the week's Monday, else the month of `now`. */
export const calendarView = (at: CalendarView | undefined, now: number, zone = viewerZone()): CalendarView => normalised(at ?? { scale: 'month', day: dayIn(now, zone) })

/** The month or week of `scale` that holds `now`. */
export const todayView = (scale: CalendarView['scale'], now: number, zone = viewerZone()): CalendarView => normalised({ scale, day: dayIn(now, zone) })

/** The month or week before (-1) or after (1) `view`. */
export const stepView = (view: CalendarView, step: -1 | 1): CalendarView =>
  view.scale === 'month' ? { scale: 'month', day: monthOf(view.day, step) } : { scale: 'week', day: addDays(monday(view.day), 7 * step) }

/** The days a calendar shows: whole weeks from the Monday on or before a month's 1st to the Sunday on or after its last day, or a week's seven. */
export const gridDays = (view: CalendarView): string[] => {
  const first = monday(view.scale === 'month' ? monthOf(view.day) : view.day)
  const last = view.scale === 'month' ? addDays(monday(addDays(monthOf(view.day, 1), -1)), 6) : addDays(first, 6)
  const count = (startOf(last) - startOf(first)) / dayMs + 1
  return Array.from({ length: count }, (_, index) => addDays(first, index))
}

/** The days `view` shows, as a range from its first day to the day after its last. */
export const rangeOf = (view: CalendarView): CalendarRange => {
  const days = gridDays(view)
  return { from: days[0]!, to: addDays(days.at(-1)!, 1) }
}

const isTimestamp = (display: DatedDisplay, model: ResourceModel) => model.fields[display.start]?.type === 'timestamp'

/**
 * The records on the days of `range`, as a list filter: those starting in it, and with an `end` those starting before
 * it and ending in or after its first day. A timestamp's `end` is the instant it is over, so one ending at midnight is
 * not on the day it starts. Each branch reads one indexed field.
 */
export const rangeFilter = (display: DatedDisplay, model: ResourceModel, range: CalendarRange, zone = viewerZone()) => {
  const timestamp = isTimestamp(display, model)
  const instant = (day: string) => new Date(startOfDayIn(day, zone)).toISOString().replace('.000Z', 'Z')
  const bound = (day: string): FilterValue => (timestamp ? { kind: 'timestamp', value: instant(day), span: { start: 0, end: 0 } } : { kind: 'string', value: day, span: { start: 0, end: 0 } })
  const within = where.and(where.gte(display.start, bound(range.from)), where.lt(display.start, bound(range.to)))
  if (display.end === undefined) return printFilter(within)
  const ending = timestamp ? where.gt(display.end, bound(range.from)) : where.gte(display.end, bound(range.from))
  return printFilter(where.or(within, where.and(where.lt(display.start, bound(range.from)), ending)))
}

/** The list's filter, its search included, narrowed to the calendar's days. */
export const withRange = (filter: string, range: string) => (filter === '' ? range : `(${filter}) AND (${range})`)

// The instant a record's date or timestamp value stands for, or none for a missing or unreadable one
const instantOf = (value: unknown) => {
  if (typeof value !== 'string') return undefined
  const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value)
  return Number.isNaN(ms) ? undefined : ms
}

/**
 * The first and last day a record is on: its start's day and its end's, where a timestamp `end` at midnight is over
 * before that day starts; its start day alone without an end or with one before its start, and none without a start.
 */
export const recordDays = (record: Record<string, unknown>, display: DatedDisplay, model: ResourceModel, zone = viewerZone()): { first: string; last: string } | undefined => {
  const start = instantOf(record[display.start])
  if (start === undefined) return undefined
  const timestamp = isTimestamp(display, model)
  const day = (ms: number) => (timestamp ? dayIn(ms, zone) : dayOf(ms))
  const first = day(start)
  const end = display.end === undefined ? undefined : instantOf(record[display.end])
  const ending = end === undefined ? first : day(timestamp ? end - 1 : end)
  return { first, last: ending < first ? first : ending }
}

/** The days of `days` a record is on, from its first through its last (`recordDays`). */
export const eventDays = (record: Record<string, unknown>, display: DatedDisplay, model: ResourceModel, days: string[], zone = viewerZone()): string[] => {
  const span = recordDays(record, display, model, zone)
  return span ? days.filter((day) => day >= span.first && day <= span.last) : []
}

/** The rows in the order they start, those without a start first. */
export const inStartOrder = (rows: ListDisplayRow[], display: DatedDisplay) => rows.toSorted((a, b) => (instantOf(a.record[display.start]) ?? 0) - (instantOf(b.record[display.start]) ?? 0))

/** The rows on each day of `days`, each day's in start order. */
export const byDay = (rows: ListDisplayRow[], display: DatedDisplay, model: ResourceModel, days: string[], zone = viewerZone()): Map<string, ListDisplayRow[]> => {
  const placed = new Map(days.map((day) => [day, [] as ListDisplayRow[]]))
  for (const row of inStartOrder(rows, display)) for (const day of eventDays(row.record, display, model, days, zone)) placed.get(day)!.push(row)
  return placed
}

/**
 * The update that moves a record shown on `from` to `to`: its `start`, and its `end` when it has one, moved by the same
 * number of days, a timestamp keeping its time of day on the clock of `zone`.
 */
export const movedPatch = (record: Record<string, unknown>, display: DatedDisplay, model: ResourceModel, from: string, to: string, zone = viewerZone()): Record<string, string> => {
  const days = (startOf(to) - startOf(from)) / dayMs
  const timestamp = isTimestamp(display, model)
  const moved = (value: unknown) => {
    const ms = instantOf(value)
    if (ms === undefined) return undefined
    return timestamp ? new Date(instantAt(ms + zoneOffset(ms, zone) + days * dayMs, zone)).toISOString() : addDays(dayOf(ms), days)
  }
  const start = moved(record[display.start])
  const end = display.end === undefined ? undefined : moved(record[display.end])
  return { ...(start !== undefined && { [display.start]: start }), ...(end !== undefined && { [display.end!]: end }) }
}
