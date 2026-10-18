import type { CalendarView, FilterValue, ListDisplayModel, ResourceModel } from '@protobase/schema'
import { printFilter, where } from '@protobase/schema'
import type { ListDisplayRow } from './list-displays'

// The days a calendar shows and the records on them, all in UTC days as `YYYY-MM-DD`, weeks from Monday.

export type CalendarDisplayModel = Extract<ListDisplayModel, { kind: 'calendar' }>

/** The days a calendar shows, as the half-open interval from the first day to the day after the last. */
export type CalendarRange = { from: string; to: string }

const dayMs = 86_400_000

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const startOf = (day: string) => Date.parse(`${day}T00:00:00Z`)

/** The day `count` days after `day`, or before it for a negative count. */
export const addDays = (day: string, count: number) => dayOf(startOf(day) + count * dayMs)

const monday = (day: string) => addDays(day, -((new Date(startOf(day)).getUTCDay() + 6) % 7))

const monthOf = (day: string, step = 0) => {
  const date = new Date(startOf(day))
  return dayOf(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + step, 1))
}

const normalised = ({ scale, day }: CalendarView): CalendarView => ({ scale, day: scale === 'month' ? monthOf(day) : monday(day) })

/** The month or week a calendar shows: the address's, starting on the month's 1st or the week's Monday, else the month of `now`. */
export const calendarView = (at: CalendarView | undefined, now: number): CalendarView => normalised(at ?? { scale: 'month', day: dayOf(now) })

/** The month or week of `scale` that holds `now`. */
export const todayView = (scale: CalendarView['scale'], now: number): CalendarView => normalised({ scale, day: dayOf(now) })

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

const isTimestamp = (display: CalendarDisplayModel, model: ResourceModel) => model.fields[display.start]?.type === 'timestamp'

/**
 * The records on the days of `range`, as a list filter: those starting in it, and with an `end` those starting before
 * it and ending in or after its first day. A timestamp's `end` is the instant it is over, so one ending at midnight is
 * not on the day it starts. Each branch reads one indexed field.
 */
export const rangeFilter = (display: CalendarDisplayModel, model: ResourceModel, range: CalendarRange) => {
  const timestamp = isTimestamp(display, model)
  const bound = (day: string): FilterValue => (timestamp ? { kind: 'timestamp', value: `${day}T00:00:00Z`, span: { start: 0, end: 0 } } : { kind: 'string', value: day, span: { start: 0, end: 0 } })
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
 * The days of `days` a record is on: from its start's day through its end's, both included, where a timestamp `end`
 * at midnight is over before that day starts; its start day alone without an end or with one before its start.
 */
export const eventDays = (record: Record<string, unknown>, display: CalendarDisplayModel, model: ResourceModel, days: string[]): string[] => {
  const start = instantOf(record[display.start])
  if (start === undefined) return []
  const first = dayOf(start)
  const end = display.end === undefined ? undefined : instantOf(record[display.end])
  const ending = end === undefined ? first : dayOf(isTimestamp(display, model) ? end - 1 : end)
  const last = ending < first ? first : ending
  return days.filter((day) => day >= first && day <= last)
}

/** The rows on each day of `days`, each day's in start order. */
export const byDay = (rows: ListDisplayRow[], display: CalendarDisplayModel, model: ResourceModel, days: string[]): Map<string, ListDisplayRow[]> => {
  const placed = new Map(days.map((day) => [day, [] as ListDisplayRow[]]))
  const ordered = rows.toSorted((a, b) => (instantOf(a.record[display.start]) ?? 0) - (instantOf(b.record[display.start]) ?? 0))
  for (const row of ordered) for (const day of eventDays(row.record, display, model, days)) placed.get(day)!.push(row)
  return placed
}

/**
 * The update that moves a record shown on `from` to `to`: its `start`, and its `end` when it has one, moved by the same
 * number of days, a timestamp keeping its time of day.
 */
export const movedPatch = (record: Record<string, unknown>, display: CalendarDisplayModel, model: ResourceModel, from: string, to: string): Record<string, string> => {
  const days = (startOf(to) - startOf(from)) / dayMs
  const timestamp = isTimestamp(display, model)
  const moved = (value: unknown) => {
    const ms = instantOf(value)
    if (ms === undefined) return undefined
    return timestamp ? new Date(ms + days * dayMs).toISOString() : addDays(dayOf(ms), days)
  }
  const start = moved(record[display.start])
  const end = display.end === undefined ? undefined : moved(record[display.end])
  return { ...(start !== undefined && { [display.start]: start }), ...(end !== undefined && { [display.end!]: end }) }
}
