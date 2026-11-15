import { describe, expect, it } from 'vitest'
import type { FieldModel } from '@protobase/schema'
import { axisTicks, timelineShape, withinBar, type TimelineFields } from './timeline-layout'
import { segmentPaint } from './timeline-paint'

const fields: TimelineFields = { lane: 'project', bar: 'task', start: 'from', end: 'to', color: 'phase' }
const hour = 3_600_000
const t0 = Date.parse('2026-11-14T00:00:00Z')
const at = (hours: number) => new Date(t0 + hours * hour).toISOString()
const record = (project: string, task: number, phase: string, from: number, to: number | null) => ({ project, task, phase, from: at(from), to: to === null ? null : at(to) })

describe('timelineShape', () => {
  it('places three lanes of two bars each by their share of the whole time', () => {
    const rows = [
      record('web', 1, 'build', 0, 2),
      record('web', 1, 'ci', 2, 3),
      record('api', 3, 'build', 1, 4),
      record('web', 2, 'build', 4, 6),
      record('docs', 5, 'ci', 2, 5),
      record('api', 4, 'build', 5, 8),
      record('docs', 6, 'build', 6, 7),
    ]
    const { lanes, from, to } = timelineShape(rows, fields, t0 + 100 * hour)
    expect([from, to]).toEqual([t0, t0 + 8 * hour])
    expect(lanes.map((lane) => lane.value)).toEqual(['web', 'api', 'docs'])
    const [web] = lanes
    expect(web!.rows).toHaveLength(1)
    const [first, second] = web!.rows[0]!
    expect(first).toMatchObject({ value: 1, left: 0, width: 37.5 })
    expect(first!.segments.map((segment) => [segment.value, segment.left, segment.width])).toEqual([['build', 0, 25], ['ci', 25, 12.5]])
    const within = withinBar(first!, first!.segments[1]!)
    expect(within.left).toBeCloseTo(200 / 3)
    expect(within.width).toBeCloseTo(100 / 3)
    expect(second).toMatchObject({ value: 2, left: 50, width: 25 })
  })

  it('runs a segment without an end to now', () => {
    const { lanes, to } = timelineShape([record('web', 1, 'build', 0, 2), record('web', 1, 'ci', 2, null)], fields, t0 + 4 * hour)
    expect(to).toBe(t0 + 4 * hour)
    expect(lanes[0]!.rows[0]![0]!.segments[1]).toMatchObject({ open: true, left: 50, width: 50 })
  })

  it('puts bars that overlap in time in rows of their own in their lane, and leaves out a record without a start', () => {
    const rows = [record('web', 1, 'build', 0, 4), record('web', 2, 'build', 1, 2), record('web', 3, 'build', 4, 5), { project: 'web', task: 9, phase: 'ci', from: null, to: null }]
    const { lanes } = timelineShape(rows, fields, t0)
    expect(lanes[0]!.rows.map((row) => row.map((bar) => bar.value))).toEqual([[1, 3], [2]])
  })

  it('draws nothing without records', () => {
    expect(timelineShape([], fields, t0)).toEqual({ lanes: [], from: t0, to: t0 })
  })
})

describe('axisTicks', () => {
  it('ticks at the shortest whole step that keeps them few, as dates from a day on', () => {
    expect(axisTicks(t0, t0 + 8 * hour)).toEqual({ daily: false, ticks: [0, 3, 6].map((hours) => ({ at: t0 + hours * hour, left: (hours / 8) * 100 })) })
    const week = axisTicks(t0 + 6 * hour, t0 + 7 * 24 * hour)
    expect(week.daily).toBe(true)
    expect(week.ticks.map((tick) => tick.at)).toEqual([1, 3, 5, 7].map((days) => t0 + days * 24 * hour))
  })

  it('ticks on the clock of the viewer, and not at all for no time', () => {
    expect(axisTicks(t0, t0 + 8 * hour, () => hour).ticks[0]!.at).toBe(t0 + 2 * hour)
    expect(axisTicks(t0, t0)).toEqual({ daily: false, ticks: [] })
  })
})

describe('axisTicks limits', () => {
  it('counts both ends, so a half hour ticks every 15 minutes, and a long range ticks in whole years', () => {
    expect(axisTicks(t0, t0 + hour / 2).ticks).toHaveLength(3)
    const decade = axisTicks(t0, t0 + 12 * 365 * 24 * hour)
    expect(decade.ticks.length).toBeLessThanOrEqual(6)
    expect(decade.daily).toBe(true)
  })

  it('keeps each daily tick at local midnight when the offset changes within the range', () => {
    // Five hours behind UTC until the 3rd of the days, four after it
    const change = t0 + 3 * 24 * hour
    const offsetOf = (ms: number) => (ms < change ? -5 * hour : -4 * hour)
    const { ticks } = axisTicks(t0, t0 + 6 * 24 * hour, offsetOf)
    expect(ticks.map((tick) => (tick.at + offsetOf(tick.at)) % (24 * hour))).toEqual(ticks.map(() => 0))
  })
})

describe('segmentPaint', () => {
  const phase = { name: 'phase', type: 'enum', enumValues: ['build', 'ci', 'land'] } as FieldModel

  it("fills a segment in its value's tone or colour, else its enum place's chart colour, striped while it waits", () => {
    const hints = { valueColors: { build: 'blue', land: '#00a651' }, waitingValues: ['ci'] }
    expect(segmentPaint(phase, hints, 'build')).toEqual({ className: 'bg-primary', striped: false })
    expect(segmentPaint(phase, hints, 'land')).toEqual({ color: '#00a651', striped: false })
    expect(segmentPaint(phase, hints, 'ci')).toEqual({ color: 'var(--chart-2)', striped: true })
    expect(segmentPaint(phase, undefined, null)).toEqual({ color: 'var(--faint-foreground)', striped: false })
  })
})
