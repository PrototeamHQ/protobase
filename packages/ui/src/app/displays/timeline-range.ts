import type { ListDisplayModel, ResourceModel, TimelineView, ViewModel } from '@protobase/schema'
import { formatDayRange, formatMonth, formatMonthName, formatMonthRange, formatWeekday } from '../../format/date'
import { dayIn, viewerZone } from '../../format/zone'
import { displayValue } from '../../live/display-value'
import { humanize } from '../../live/naming'
import { addDays, monday, monthOf, recordDays, type CalendarRange } from './calendar-range'
import type { ListDisplayRow } from './list-displays'

// The days a timeline shows, as `YYYY-MM-DD` days, weeks from Monday and quarters from January, April, July and
// October; where each record's bar lies on them, and the lanes of its `group`.

export type TimelineDisplayModel = Extract<ListDisplayModel, { kind: 'timeline' }>

const dayMs = 86_400_000
const ms = (day: string) => Date.parse(`${day}T00:00:00Z`)

const quarterOf = (day: string, step = 0) => {
  const date = new Date(ms(day))
  return new Date(Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3 + 3 * step, 1)).toISOString().slice(0, 10)
}

const normalised = ({ scale, day }: TimelineView): TimelineView => ({ scale, day: scale === 'week' ? monday(day) : scale === 'month' ? monthOf(day) : quarterOf(day) })

/** The period a timeline shows: the address's, from the week's Monday, the month's 1st or the quarter's, else the month of `now`. */
export const timelineView = (at: TimelineView | undefined, now: number, zone = viewerZone()): TimelineView => normalised(at ?? { scale: 'month', day: dayIn(now, zone) })

/** The week before (-1) or after (1) `view`, or the month or quarter. */
export const stepTimeline = (view: TimelineView, step: -1 | 1): TimelineView => {
  const { scale, day } = normalised(view)
  return { scale, day: scale === 'week' ? addDays(day, 7 * step) : scale === 'month' ? monthOf(day, step) : quarterOf(day, step) }
}

/** The days a timeline shows: the week's seven, the month's, or the quarter's. */
export const timelineDays = (view: TimelineView): string[] => {
  const first = normalised(view).day
  const count = (ms(stepTimeline(view, 1).day) - ms(first)) / dayMs
  return Array.from({ length: count }, (_, index) => addDays(first, index))
}

/** The days `view` shows, as a range from its first day to the day after its last. */
export const timelineRange = (view: TimelineView): CalendarRange => ({ from: normalised(view).day, to: stepTimeline(view, 1).day })

/**
 * The period of `scale` a timeline switches to: the one holding today when the period shown holds it, else the one
 * holding the period's first day.
 */
export const scaledTimeline = (view: TimelineView, scale: TimelineView['scale'], now: number, zone = viewerZone()): TimelineView => {
  const today = dayIn(now, zone)
  const days = timelineDays(view)
  return normalised({ scale, day: today >= days[0]! && today <= days.at(-1)! ? today : days[0]! })
}

/** The heading of the period a timeline shows: "12–18 Oct 2026", "October 2026", "October – December 2026". */
export const timelineHeading = (view: TimelineView) => {
  const days = timelineDays(view)
  if (view.scale === 'week') return formatDayRange(ms(days[0]!), ms(days.at(-1)!))
  return view.scale === 'month' ? formatMonth(ms(days[0]!)) : formatMonthRange(ms(days[0]!), ms(monthOf(days.at(-1)!)))
}

/**
 * A mark on a timeline's scale: from the day at `index`, `span` days long. `minor` marks are left out where the scale
 * is narrow, on a phone.
 */
export type TimelineTick = { index: number; span: number; label: string; minor?: boolean }

/** The marks of a timeline's scale: a week's days by weekday and number, a month's by number, a quarter's months by name. */
export const timelineTicks = (view: TimelineView): TimelineTick[] => {
  const days = timelineDays(view)
  if (view.scale === 'week') return days.map((day, index) => ({ index, span: 1, label: `${formatWeekday(ms(day))} ${Number(day.slice(8))}` }))
  if (view.scale === 'month') return days.map((day, index) => ({ index, span: 1, label: String(Number(day.slice(8))), ...(index % 7 !== 0 && { minor: true }) }))
  const firsts = days.flatMap((day, index) => (day.endsWith('-01') ? [index] : []))
  return firsts.map((index, at) => ({ index, span: (firsts[at + 1] ?? days.length) - index, label: formatMonthName(ms(days[index]!)) }))
}

/**
 * Where a record's bar lies on `days`: the index of its first and last day shown, and whether it starts before them or
 * ends after them; none for a record without a start or off them.
 */
export const barOf = (record: Record<string, unknown>, display: TimelineDisplayModel, model: ResourceModel, days: string[], zone = viewerZone()) => {
  const span = recordDays(record, display, model, zone)
  const first = days[0]
  const last = days.at(-1)
  if (!span || first === undefined || last === undefined || span.last < first || span.first > last) return undefined
  return {
    first: span.first < first ? 0 : days.indexOf(span.first),
    last: span.last > last ? days.length - 1 : days.indexOf(span.last),
    before: span.first < first,
    after: span.last > last,
    /** The day the record starts on, shown or not. */
    start: span.first,
  }
}

/** A lane of a timeline: the records with one value of its `group`, headed by that value; the one lane of a timeline without a group has no heading. */
export type TimelineLane = { key: string; label?: string; rows: ListDisplayRow[] }

const noValue = 'none'

/**
 * The lanes of a timeline: one per value of its `group` that a record has, each with its records in their order; an
 * enum's in the order the field lists its values, a relation's by the name of the record it points at, others by value,
 * and last the records without a value, headed "No <field>" as a board's column is.
 */
export const timelineLanes = (rows: ListDisplayRow[], model: ResourceModel, view: ViewModel | undefined, display: TimelineDisplayModel): TimelineLane[] => {
  const group = display.group
  const field = group === undefined ? undefined : model.fields[group]
  if (group === undefined || !field) return [{ key: '', rows }]
  const hints = view?.fields[group]
  const lanes = new Map<string, { value: unknown; lane: TimelineLane }>()
  for (const row of rows) {
    const value = row.record[group]
    const empty = value === null || value === undefined || value === ''
    const key = empty ? noValue : `value:${String(value)}`
    const label = empty ? `No ${(hints?.label ?? humanize(group)).toLowerCase()}` : (row.labels[group] ?? displayValue(field, value, hints))
    const known = lanes.get(key) ?? { value: empty ? undefined : value, lane: { key, label, rows: [] } }
    known.lane.rows.push(row)
    lanes.set(key, known)
  }
  const order = field.enumValues ?? []
  const compare = (a: { value: unknown; lane: TimelineLane }, b: { value: unknown; lane: TimelineLane }) => {
    if (a.value === undefined || b.value === undefined) return Number(a.value === undefined) - Number(b.value === undefined)
    if (field.type === 'enum') return order.indexOf(String(a.value)) - order.indexOf(String(b.value))
    if (field.type === 'relation') return a.lane.label!.localeCompare(b.lane.label!)
    if (typeof a.value === 'number' && typeof b.value === 'number') return a.value - b.value
    return String(a.value).localeCompare(String(b.value), undefined, { numeric: true })
  }
  return [...lanes.values()].toSorted(compare).map(({ lane }) => lane)
}
