// Where a timeline draws each record: a lane per `lane` value in the order they first start, a bar per `bar` value
// in its lane, and a segment per record from `start` to `end`, all placed as a share of the time from the earliest
// start to the latest end, so the axis always fits the width it has. A record without an end runs to now.

type Row = Record<string, unknown>

/** The fields a timeline reads of each record, by their roles. */
export type TimelineFields = { lane: string; bar: string; start: string; end: string; color: string }

/** One record as a part of its bar: its colour value, its time in ms, `open` when it has no end, and where it sits in %. */
export type TimelineSegment = { record: Row; value: unknown; start: number; end: number; open: boolean; left: number; width: number }

/** The records of one `bar` value in a lane, from its first start to its last end, placed in %. */
export type TimelineBar = { key: string; value: unknown; lane: unknown; start: number; end: number; left: number; width: number; segments: TimelineSegment[] }

/** One lane: its value, and its bars packed into rows so none overlap another in time. */
export type TimelineLane = { key: string; value: unknown; rows: TimelineBar[][] }

/** What a timeline draws: its lanes, and the time its axis runs over. */
export type TimelineShape = { lanes: TimelineLane[]; from: number; to: number }

const timeOf = (value: unknown) => {
  if (typeof value !== 'string' && typeof value !== 'number') return
  const ms = typeof value === 'number' ? value : Date.parse(value)
  return Number.isNaN(ms) ? undefined : ms
}

/** The key a lane or bar value is grouped by. */
export const keyOf = (value: unknown) => (value === null || value === undefined ? '' : String(value))

const share = (ms: number, from: number, span: number) => (span === 0 ? 0 : ((ms - from) / span) * 100)

type Grouped = { value: unknown; bars: Map<string, { value: unknown; records: Array<{ record: Row; start: number; end: number; open: boolean }> }> }

// Records grouped into lanes and bars, each with its time; one without a start cannot be placed and is left out
const groupOf = (rows: Row[], fields: TimelineFields, now: number) => {
  const lanes = new Map<string, Grouped>()
  for (const record of rows) {
    const start = timeOf(record[fields.start])
    if (start === undefined) continue
    const given = timeOf(record[fields.end])
    const end = Math.max(start, given ?? now)
    const lane = lanes.get(keyOf(record[fields.lane])) ?? { value: record[fields.lane], bars: new Map() }
    lanes.set(keyOf(record[fields.lane]), lane)
    const bar = lane.bars.get(keyOf(record[fields.bar])) ?? { value: record[fields.bar], records: [] }
    lane.bars.set(keyOf(record[fields.bar]), bar)
    bar.records.push({ record, start, end, open: given === undefined })
  }
  return lanes
}

// Each bar goes in the first row of its lane whose last bar ended by the time it starts, or a new row
const pack = (bars: TimelineBar[]) => {
  const rows: TimelineBar[][] = []
  for (const bar of [...bars].sort((a, b) => a.start - b.start)) {
    const row = rows.find((placed) => placed.at(-1)!.end <= bar.start)
    if (row) row.push(bar)
    else rows.push([bar])
  }
  return rows
}

/** Lanes, bars and segments of `rows`, placed between the earliest start and the latest end, an open end at `now`. */
export const timelineShape = (rows: Row[], fields: TimelineFields, now: number): TimelineShape => {
  const grouped = groupOf(rows, fields, now)
  const times = [...grouped.values()].flatMap((lane) => [...lane.bars.values()].flatMap((bar) => bar.records))
  if (times.length === 0) return { lanes: [], from: now, to: now }
  const from = Math.min(...times.map((time) => time.start))
  const to = Math.max(...times.map((time) => time.end))
  const span = to - from
  const lanes = [...grouped.entries()].map(([key, lane]): TimelineLane => {
    const bars = [...lane.bars.entries()].map(([barKey, bar]): TimelineBar => {
      const segments = bar.records
        .sort((a, b) => a.start - b.start)
        .map(({ record, start, end, open }) => ({ record, value: record[fields.color], start, end, open, left: share(start, from, span), width: share(end, from, span) - share(start, from, span) }))
      const start = segments[0]!.start
      const end = Math.max(...segments.map((segment) => segment.end))
      return { key: barKey, value: bar.value, lane: lane.value, start, end, left: share(start, from, span), width: share(end, from, span) - share(start, from, span), segments }
    })
    return { key, value: lane.value, rows: pack(bars) }
  })
  return { lanes, from, to }
}

/** A segment's place within its bar, in % of the bar's width, for drawing it inside the bar. */
export const withinBar = (bar: TimelineBar, segment: TimelineSegment) => {
  const span = bar.end - bar.start
  return { left: share(segment.start, bar.start, span), width: span === 0 ? 100 : ((segment.end - segment.start) / span) * 100 }
}

const minute = 60_000
const hour = 60 * minute
const day = 24 * hour

/** The steps an axis ticks at, the shortest first. */
export const tickSteps = [5 * minute, 15 * minute, 30 * minute, hour, 3 * hour, 6 * hour, 12 * hour, day, 2 * day, 7 * day, 14 * day, 30 * day, 90 * day, 365 * day]

/** How many ticks an axis shows at most, so their labels fit a phone's width. */
export const maxTicks = 6

const year = 365 * day

// How many whole local steps lie from `from` to `to`, both included, on a clock `fromOffset` ms ahead of UTC at `from` and `toOffset` at `to`
const stepsIn = (from: number, to: number, step: number, fromOffset: number, toOffset: number) => Math.floor((to + toOffset) / step) - Math.ceil((from + fromOffset) / step) + 1

/**
 * The ticks of an axis from `from` to `to`: the shortest step that gives at most `maxTicks`, past the last of
 * `tickSteps` whole years, each on a whole step of the clock `offsetOf` gives at a moment, its ms ahead of UTC there,
 * so a tick stays on its local hour or midnight when the offset changes within the range, and a local time the clock
 * skips gets none. Each is placed in %;
 * `daily` when the step is a day or more, so they read as dates.
 */
export const axisTicks = (from: number, to: number, offsetOf: (ms: number) => number = () => 0) => {
  const span = to - from
  if (span <= 0) return { daily: false, ticks: [] }
  const offset = offsetOf(from)
  const endOffset = offsetOf(to)
  const step = tickSteps.find((candidate) => stepsIn(from, to, candidate, offset, endOffset) <= maxTicks) ?? Math.ceil(span / (maxTicks - 1) / year) * year
  const ticks: Array<{ at: number; left: number }> = []
  for (let local = Math.ceil((from + offset) / step) * step; local <= to + endOffset; local += step) {
    // The local step's moment, by the offset in force near it; a step the clock skips, as it springs forward, has none
    const at = local - offsetOf(local - offset)
    if (at + offsetOf(at) !== local) continue
    if (at >= from && at <= to) ticks.push({ at, left: share(at, from, span) })
  }
  return { daily: step >= day, ticks }
}
